# Operator checklist

## Repository gate
- [x] GitHub repository exists under the target owner.
- [x] `main` contains the certified MVP implementation.
- [x] GitHub Actions `ci` is green for the MVP baseline.

## Hardening certification
- [x] Server-side auth ignores client-supplied user IDs.
- [x] Production configuration fails closed unless Supabase + Anthropic + Judge0 are selected.
- [x] Generation/submission rate-limit behavior is covered by tests.
- [x] Submission idempotency is covered by unit and HTTP smoke tests.
- [x] Judge0 payload explicitly disables network and sets CPU/wall/memory/process/file limits.
- [x] Supabase bootstrap schema enables RLS and revokes browser-role table access.
- [x] Supabase server client uses modern secret keys only through the `apikey` header.
- [x] Local `npm run check` passes.

## External production configuration
- [ ] Create a **dedicated** Clanker Arena Supabase project; do not reuse an unrelated project.
- [ ] Apply `db/supabase-bootstrap.sql` and run Supabase security + performance advisors.
- [ ] Configure GitHub and/or Google providers in Supabase Auth and a browser sign-in/session flow.
- [ ] Set `APP_ENV=production`, `AUTH_MODE=supabase`, `STORAGE_MODE=supabase`.
- [ ] Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`.
- [ ] Configure `GENERATOR_MODE=anthropic`, `ANTHROPIC_API_KEY`, and an explicitly selected `ANTHROPIC_MODEL`.
- [ ] Configure `JUDGE_MODE=judge0`, `JUDGE0_URL`, optional auth token, and correct Python language ID.
- [ ] Verify the Judge0 host permits the requested restrictions through `/config_info`; fail the release if networking cannot be disabled.
- [ ] Run hosted browser E2E: sign in -> generate -> judge -> score -> leaderboard -> idempotent retry.
- [ ] Capture rollback and secret-rotation procedures.

Do not describe the app as production-safe while public traffic can reach demo auth, JSON persistence, the local judge, or an unverified Judge0 host.
