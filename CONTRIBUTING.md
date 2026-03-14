# Contributing

Thanks for wanting to improve `skill-doctor`.

## Local setup

```bash
git clone https://github.com/marian2js/skill-doctor.git
cd skill-doctor
pnpm install
```

## Main commands

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```

Run the CLI locally against a skill workspace:

```bash
node packages/skill-doctor/dist/cli.js /path/to/skills
```

## Project structure

- `packages/skill-doctor/src/cli.ts`: CLI entrypoint
- `packages/skill-doctor/src/scan.ts`: workspace-level orchestration
- `packages/skill-doctor/src/analyze-skill.ts`: static analysis engine
- `packages/skill-doctor/src/rules.ts`: rule catalog and severity behavior
- `packages/skill-doctor/src/render.ts`: terminal UI and report rendering
- `packages/skill-doctor/tests`: API and CLI coverage

## Adding or tuning rules

1. Add or update the rule in `packages/skill-doctor/src/rules.ts`.
2. Implement the behavior in `packages/skill-doctor/src/analyze-skill.ts`.
3. Add tests in `packages/skill-doctor/tests`.
4. Calibrate the result against real-world skills before merging.

The default bar is intentionally conservative. Strong skills should scan cleanly or close to cleanly in default mode, while `--strictness strict` and `--strictness pedantic` can surface more opinionated guidance.
