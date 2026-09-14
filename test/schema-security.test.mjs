import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../db/supabase-bootstrap.sql', import.meta.url), 'utf8').toLowerCase();

test('Supabase bootstrap enables RLS and does not expose application tables to browser roles', () => {
  for (const table of ['users', 'generations', 'submissions', 'solves', 'rate_limit_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all on public\.users[\s\S]*from anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete[\s\S]*to service_role/);
});

test('mutation RPCs are security invoker and restricted to service_role', () => {
  assert.doesNotMatch(sql, /security definer/);
  assert.match(sql, /create or replace function public\.consume_rate_limit[\s\S]*security invoker/);
  assert.match(sql, /create or replace function public\.apply_submission_result[\s\S]*security invoker/);
  assert.match(sql, /grant execute on function public\.apply_submission_result[\s\S]*to service_role/);
});
