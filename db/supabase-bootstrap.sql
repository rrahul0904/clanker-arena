-- Clanker Arena production bootstrap for Supabase Postgres 17+
-- Apply to a dedicated Clanker Arena project, then run Supabase security/performance advisors.
-- The application uses a server-side sb_secret_* key; anon/authenticated receive no table grants.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 1 and 40),
  display_name text not null check (char_length(display_name) between 1 and 80),
  rating integer not null default 1200 check (rating >= 0),
  tier text not null default 'Apprentice',
  solved_count integer not null default 0 check (solved_count >= 0),
  submission_count integer not null default 0 check (submission_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  challenge_slug text not null,
  prompt text not null check (char_length(prompt) <= 12000),
  code text not null check (char_length(code) <= 40000),
  provider text not null,
  model text not null,
  input_chars integer not null check (input_chars >= 0),
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  challenge_slug text not null,
  prompt text not null,
  generated_code text not null,
  generation_id uuid references public.generations(id) on delete restrict,
  verdict jsonb not null,
  score jsonb not null,
  rating_delta integer not null default 0,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (generation_id),
  unique (user_id, idempotency_key)
);

create table if not exists public.solves (
  user_id uuid not null references public.users(id) on delete cascade,
  challenge_slug text not null,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  solved_at timestamptz not null default now(),
  primary key (user_id, challenge_slug)
);

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  scope text not null check (scope in ('generation', 'submission')),
  created_at timestamptz not null default now()
);

create index if not exists generations_user_created_idx on public.generations (user_id, created_at desc);
create index if not exists submissions_user_challenge_created_idx on public.submissions (user_id, challenge_slug, created_at desc);
create index if not exists rate_limit_events_lookup_idx on public.rate_limit_events (user_id, scope, created_at desc);

alter table public.users enable row level security;
alter table public.generations enable row level security;
alter table public.submissions enable row level security;
alter table public.solves enable row level security;
alter table public.rate_limit_events enable row level security;

revoke all on public.users, public.generations, public.submissions, public.solves, public.rate_limit_events from anon, authenticated;
grant select, insert, update, delete on public.users, public.generations, public.submissions, public.solves, public.rate_limit_events to service_role;
grant usage, select on sequence public.rate_limit_events_id_seq to service_role;

create or replace function public.rating_tier(p_rating integer)
returns text
language sql
immutable
strict
as $$
  select case
    when p_rating >= 2200 then 'Grandmaster'
    when p_rating >= 1900 then 'Master'
    when p_rating >= 1600 then 'Expert'
    when p_rating >= 1400 then 'Specialist'
    when p_rating >= 1200 then 'Apprentice'
    else 'Newbie'
  end;
$$;

create or replace function public.consume_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_oldest timestamptz;
  v_window interval;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'rate limit configuration must be positive';
  end if;
  if p_scope not in ('generation', 'submission') then
    raise exception 'invalid rate-limit scope';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;

  delete from public.rate_limit_events
   where user_id = p_user_id
     and scope = p_scope
     and created_at < now() - v_window;

  select count(*)::integer, min(created_at)
    into v_count, v_oldest
    from public.rate_limit_events
   where user_id = p_user_id and scope = p_scope;

  if v_count >= p_limit then
    return query select false, 0,
      greatest(1, ceil(extract(epoch from ((v_oldest + v_window) - now())))::integer);
    return;
  end if;

  insert into public.rate_limit_events(user_id, scope) values (p_user_id, p_scope);
  return query select true, greatest(0, p_limit - v_count - 1), 0;
end;
$$;

create or replace function public.apply_submission_result(
  p_user_id uuid,
  p_challenge_slug text,
  p_prompt text,
  p_generated_code text,
  p_generation_id uuid,
  p_verdict jsonb,
  p_score jsonb,
  p_rating_delta integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_generation public.generations%rowtype;
  v_existing public.submissions%rowtype;
  v_submission public.submissions%rowtype;
  v_user public.users%rowtype;
  v_rows integer := 0;
  v_passed_all boolean := false;
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;

  if p_idempotency_key is not null then
    select * into v_existing
      from public.submissions
     where user_id = p_user_id and idempotency_key = p_idempotency_key
     limit 1;
    if found then
      select * into v_user from public.users where id = p_user_id;
      return jsonb_build_object('submission', to_jsonb(v_existing), 'user', to_jsonb(v_user), 'replayed', true);
    end if;
  end if;

  if p_generation_id is null then
    raise exception 'generation_id is required';
  end if;

  select * into v_generation
    from public.generations
   where id = p_generation_id
   for update;
  if not found then raise exception 'generation not found'; end if;
  if v_generation.user_id <> p_user_id
     or v_generation.challenge_slug <> p_challenge_slug
     or v_generation.prompt <> p_prompt
     or v_generation.code <> p_generated_code then
    raise exception 'generation does not match submission';
  end if;

  if exists (select 1 from public.submissions where generation_id = p_generation_id) then
    raise exception 'generation already submitted';
  end if;

  insert into public.submissions(
    user_id, challenge_slug, prompt, generated_code, generation_id,
    verdict, score, rating_delta, idempotency_key
  ) values (
    p_user_id, p_challenge_slug, p_prompt, p_generated_code, p_generation_id,
    p_verdict, p_score, p_rating_delta, p_idempotency_key
  ) returning * into v_submission;

  update public.users
     set rating = greatest(0, rating + p_rating_delta),
         tier = public.rating_tier(greatest(0, rating + p_rating_delta)),
         submission_count = submission_count + 1,
         updated_at = now()
   where id = p_user_id
   returning * into v_user;

  v_passed_all := coalesce((p_verdict ->> 'total')::integer, 0) > 0
    and coalesce((p_verdict ->> 'passed')::integer, -1) = coalesce((p_verdict ->> 'total')::integer, 0);

  if v_passed_all then
    insert into public.solves(user_id, challenge_slug, submission_id, solved_at)
    values (p_user_id, p_challenge_slug, v_submission.id, v_submission.created_at)
    on conflict (user_id, challenge_slug) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      update public.users
         set solved_count = solved_count + 1,
             updated_at = now()
       where id = p_user_id
       returning * into v_user;
    end if;
  end if;

  return jsonb_build_object('submission', to_jsonb(v_submission), 'user', to_jsonb(v_user), 'replayed', false);
end;
$$;

revoke execute on function public.rating_tier(integer) from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.apply_submission_result(uuid, text, text, text, uuid, jsonb, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.rating_tier(integer) to service_role;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.apply_submission_result(uuid, text, text, text, uuid, jsonb, jsonb, integer, text) to service_role;
