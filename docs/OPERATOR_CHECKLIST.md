# Operator checklist

## Repository gate
- [ ] GitHub repository exists under the target owner.
- [ ] `main` contains the complete implementation.
- [ ] GitHub Actions `ci` is green.

## Local certification
- [x] Unit tests cover tiering, scoring, local judge safety boundary, and end-to-end submission.
- [x] Smoke test boots the real HTTP server and exercises generate -> judge -> score.
- [x] Default mode requires no external credentials.

## Production-only external configuration
- [ ] Configure `GENERATOR_MODE=anthropic`, `ANTHROPIC_API_KEY`, and an explicitly selected `ANTHROPIC_MODEL`.
- [ ] Configure `JUDGE_MODE=judge0`, `JUDGE0_URL`, optional auth token, and correct Python language ID.
- [ ] Replace JSON persistence with durable Postgres/Supabase storage before multi-instance deployment.
- [ ] Add OAuth before accepting public user submissions.

Do not describe the app as production-safe while the local judge or JSON store is serving public traffic.
