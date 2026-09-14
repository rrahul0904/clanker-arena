# Production hardening

## Modes

Development defaults remain intentionally self-contained: `AUTH_MODE=demo`, `STORAGE_MODE=json`, `GENERATOR_MODE=mock`, and `JUDGE_MODE=local`.

A production process must set `APP_ENV=production`. Startup then fails closed unless all four production boundaries are active:

- `AUTH_MODE=supabase`
- `STORAGE_MODE=supabase`
- `GENERATOR_MODE=anthropic`
- `JUDGE_MODE=judge0`

Production also requires idempotency keys automatically and rejects the unsafe local-remote-code override.

## Supabase

`db/supabase-bootstrap.sql` is a bootstrap schema for a **dedicated** Clanker Arena Supabase project. It is intentionally not presented as an applied migration because no Clanker Arena Supabase project has been provisioned yet.

The schema keeps every application table behind RLS and explicitly revokes `anon` and `authenticated` table access. The Node backend uses a modern server-only `sb_secret_*` key; user authentication uses a browser/session JWT plus the project's `sb_publishable_*` key. API keys are sent on `apikey`, while the user JWT is sent on `Authorization: Bearer ...`.

The two mutation helpers are `SECURITY INVOKER`, callable only by `service_role`:

- `consume_rate_limit` atomically reserves generation/submission capacity.
- `apply_submission_result` atomically verifies the generation binding, prevents generation reuse, inserts the submission, applies rating, and records first solve.

After applying the schema, run Supabase security and performance advisors and verify there are no public grants or unexpected policies before enabling production traffic.

## HTTP trust boundary

The API ignores any client-provided `userId`. Mutable routes derive identity server-side. `GET /api/submissions/:id` is owner-protected. Production POSTs require `Idempotency-Key`; repeated submission idempotency keys return the original result instead of scoring twice.

## Judge0

Remote code is sent only to Judge0 in production. Each submission explicitly disables networking and sets CPU, wall-clock, memory, process/thread, and file-size limits. Actual support for custom limits depends on the Judge0 host configuration and must be verified against `/config_info` before release.
