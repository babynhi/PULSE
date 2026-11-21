# PULSE — Agent Guide

Shared project instructions for coding agents. Keep these instructions in
`AGENTS.md`; `CLAUDE.md` imports this file.

## Project context

PULSE is a real-world multiplayer infection survival game with hidden roles,
Bluetooth proximity, and a shrinking safe zone. The mobile app currently uses
Expo, React Native, and TypeScript.

## Read before working

- Read [docs/PRD.md](docs/PRD.md) before implementing or changing product behavior.
  It defines gameplay, feature phases, and acceptance criteria; it does not
  imply that every described feature is already implemented.
- Read [app/AGENTS.md](app/AGENTS.md) before working inside `app/`.
- Inspect the relevant code and `app/package.json` before choosing commands or
  dependencies. Surface conflicts between the request, PRD, and implementation.

## Repository layout

- `app/`: Expo mobile application; currently starts from `app/App.tsx`.
- `docs/`: shared product and technical documentation, including the PRD.
- `.agents/`: agent-specific tooling and supporting files.

## Commands

Prefix shell commands with `rtk`. Use `rtk proxy <command>` when a filter fails
or raw output is needed. The app uses npm and `app/package-lock.json`.
Run these commands from `app/`:

```sh
rtk proxy npm ci             # install locked dependencies
rtk npm run start            # start Expo
rtk npm run web              # start the web preview
rtk proxy npx tsc --noEmit   # typecheck
```

## Working conventions

- Keep changes focused on the requested task and follow existing code patterns.
- Before starting a task, check `git status --short --branch` and identify the
  current branch. Keep work on the branch the user requested; do not switch to
  `main` or another branch implicitly. If the requested branch is unclear,
  continue read-only inspection and ask before making branch-dependent changes.
- Before committing or pushing, re-check the branch and upstream with
  `git status --short --branch` and `git branch --show-current`. Push only the
  intended branch to its intended upstream; never push merely because a task is
  complete. If the target is ambiguous, leave the changes local and ask.
- Keep gameplay rules consistent with the PRD; record agreed changes there.
- Keep the PRD in `docs/`; put agent behavior instructions in `AGENTS.md` files.
- Preserve unrelated work and never commit credentials or local secrets.
- For code changes, run typechecking and relevant available lint/tests. Report
  what was checked and any checks that could not run. Validate documentation
  paths and references for documentation-only changes.
