# Clanker Arena

A clean-room, public-behavior-inspired implementation of an AI prompt-engineering coding arena: contestants prompt a model, generated Python is judged against public + hidden tests, scores affect rating, and the leaderboard updates immediately.

## Current status

The repository now has two execution profiles:

**Certified development/CI profile**
- demo server-side identity,
- JSON persistence,
- deterministic mock generation,
- local Python judge restricted to mock-generated code.

**Production boundary profile**
- Supabase Auth JWT validation,
- Supabase/Postgres persistence via server-only REST/RPC,
- Anthropic generation,
- Judge0 execution with explicit resource/network restrictions,
- idempotency and per-user rate limits,
- fail-closed production configuration.

A hosted production release is **not** claimed yet because a dedicated Clanker Arena Supabase project, provider configuration, hosted Judge0 verification, and browser sign-in flow still need to be provisioned and certified.

## What works now

- Three challenge types with public/hidden tests.
- Prompt -> generated candidate flow.
- Deterministic no-secret generator for local development and CI.
- Anthropic adapter behind environment configuration.
- Local development judge with a strict safety boundary.
- Hardened Judge0 production adapter.
- 100-point scoring: correctness 70, performance 15, quality 10, prompt efficiency 5.
- Rating/tier changes and leaderboard projection.
- Generation/submission idempotency and rate limiting.
- Server-side identity trust boundary; client `userId` is ignored.
- JSON and Supabase persistence adapters.
- Supabase RLS/bootstrap schema with atomic rating/submission RPC.
- Health + readiness endpoints.
- Responsive web UI.
- Node unit/integration tests and a full HTTP smoke test.
- Docker image and GitHub Actions CI.

## Run locally

Requirements: Node 22+ and Python 3.

```bash
npm test
npm run smoke
npm start
```

Open http://localhost:3000. No `npm install` is required because the application deliberately has zero runtime dependencies.

## Production rule

Set `APP_ENV=production`. The process will fail startup unless all production boundaries are selected and configured. See `docs/PRODUCTION_HARDENING.md`, `docs/OPERATOR_CHECKLIST.md`, and `db/supabase-bootstrap.sql`.

## Environment

Copy `.env.example` values into your deployment environment. The process intentionally does not auto-load `.env`; use your platform's environment manager or a shell export.

## Provenance

This is an independent implementation. It does not copy ClankerRank source code, private APIs, private tests, proprietary scoring algorithms, or branded assets. See `docs/REVERSE_ENGINEERING.md`.
