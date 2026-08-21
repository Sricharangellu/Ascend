# Ascend — Claude Code Entry Point

Read [`AGENTS.md`](./AGENTS.md) first. It is the ONE agent instruction file for this repo —
operating contract, read order, repository map, git rules, lock protocol, gates, PR flow.

**This file is a pointer, and must stay one.** Do not move instructions here, summarize
`AGENTS.md` here, or let this file grow real content — a second instruction file drifts out of
sync with the first, and then agents follow whichever one they happened to load. This is
enforced, not merely preferred: `.github/workflows/ci.yml` requires exactly one tracked
`AGENTS.md` and permits `CLAUDE.md` only as a short pointer to it, and
`tools/prevention-agent.mjs` documents the same rule (it exempts this file by name *because*
it is a pointer). If the codebase overview you need is missing, add it to `AGENTS.md` or the
file its source-of-truth table maps — never here.
