# Architecture

## Current MVP

Browser UI -> Node HTTP API -> submission service -> generator adapter -> judge adapter -> scoring/rating -> JSON persistence -> leaderboard projection.

### Adapters

- `GENERATOR_MODE=mock`: deterministic safe templates, no credentials, CI-friendly.
- `GENERATOR_MODE=anthropic`: native HTTPS call; requires `ANTHROPIC_API_KEY` and explicit `ANTHROPIC_MODEL`.
- `JUDGE_MODE=local`: development-only Python subprocess. It only accepts mock-generated code unless the explicit unsafe override is enabled.
- `JUDGE_MODE=judge0`: production boundary for untrusted generated code.

## Security boundary

The local subprocess is **not a production sandbox**. Static token blocking is defense-in-depth for local deterministic fixtures, not a security guarantee. Production-generated code must execute in Judge0 or another hardened isolated runner.

## Production evolution

Replace JSON persistence with Postgres/Supabase while keeping the domain services unchanged. Put generation and judging behind authenticated rate-limited APIs; add OAuth; transactionally apply rating changes; store hidden tests in a privileged server-only schema; add idempotency keys to generation and submission endpoints.

## Anti-gaming invariants

- A generated candidate is bound to user, challenge, prompt, and code.
- A generation can be submitted only once.
- Rating gains are based on improvement over the user's prior best score for that challenge; replaying another perfect candidate yields zero additional rating.
- Hidden test inputs and expected values are never returned by challenge endpoints.
