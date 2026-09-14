# Architecture

## Runtime flow

Browser UI -> Node HTTP API -> server-side identity -> submission service -> generator adapter -> judge adapter -> scoring/rating -> persistence adapter -> leaderboard projection.

### Adapters

- `AUTH_MODE=demo`: deterministic development identity.
- `AUTH_MODE=supabase`: validates a Supabase Auth user JWT server-side and ignores any client-supplied user ID.
- `STORAGE_MODE=json`: single-process local persistence for development/CI.
- `STORAGE_MODE=supabase`: server-only REST/RPC persistence using a modern `sb_secret_*` key.
- `GENERATOR_MODE=mock`: deterministic safe templates, no credentials, CI-friendly.
- `GENERATOR_MODE=anthropic`: native HTTPS call; requires `ANTHROPIC_API_KEY` and explicit `ANTHROPIC_MODEL`.
- `JUDGE_MODE=local`: development-only Python subprocess. It accepts only mock-generated code unless the explicit unsafe override is enabled.
- `JUDGE_MODE=judge0`: production boundary for untrusted generated code with explicit CPU, wall, memory, process, file, and network restrictions.

## Fail-closed production configuration

`APP_ENV=production` refuses to start unless Supabase auth + persistence, Anthropic generation, and Judge0 execution are all configured. Production also requires idempotency keys and disallows the local remote-code override.

## Persistence consistency

The Supabase bootstrap schema keeps application tables behind RLS with no browser-role table grants. Server-only `SECURITY INVOKER` RPCs provide:

- serialized per-user generation/submission rate-limit accounting,
- exact generation-to-submission binding,
- single-use generations,
- idempotent submission replay,
- atomic submission insert + rating update + first-solve update.

The JSON adapter mirrors these invariants for deterministic local certification.

## Security boundary

The local subprocess is **not a production sandbox**. Static token blocking is defense-in-depth for local deterministic fixtures, not a security guarantee. Production-generated code must execute in Judge0 or another hardened isolated runner.

Supabase `user_metadata` is used only for display-name/handle suggestions. Authorization is based solely on the authenticated user ID returned by Supabase Auth.

## Anti-gaming invariants

- A generated candidate is bound to user, challenge, prompt, and code.
- A generation can be submitted only once.
- Replaying a submission idempotency key returns the original submission instead of rescoring.
- Rating gains are based on improvement over the user's prior best score for that challenge; replaying another perfect candidate yields zero additional rating.
- Hidden test inputs and expected values are never returned by challenge endpoints.
