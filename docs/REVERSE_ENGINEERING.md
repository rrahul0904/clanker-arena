# Public-behavior reverse engineering notes

This project reproduces the **product pattern**, not ClankerRank's private implementation, branding, assets, hidden tests, proprietary scoring algorithm, or private APIs.

Observed public product concepts that informed the build:

- A leaderboard-oriented prompt-engineering competition.
- A challenge contains narrative instructions, starter code, a required function, visible examples, hidden tests, and runtime/memory constraints.
- The contestant submits a natural-language instruction; an LLM generates code; code is judged separately.
- Profiles expose a rating/tier ladder and solved/submission counts.
- Publicly described infrastructure includes an LLM provider, isolated code execution, authentication, persistence, and notifications.

The exact upstream rating equation is not public. Clanker Arena therefore uses a deliberately documented scoring and rating model rather than pretending to reproduce a proprietary formula.
