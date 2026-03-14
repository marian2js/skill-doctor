<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/skill-doctor-readme-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/skill-doctor-readme-logo-light.svg">
  <img alt="Skill Doctor" src="./assets/skill-doctor-readme-logo-light.svg" width="210" height="48">
</picture>

[![CI](https://github.com/marian2js/skill-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/marian2js/skill-doctor/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/marian2js/skill-doctor)](./LICENSE)

Let coding agents diagnose agent skills before they break routing, onboarding, or evals.

`skill-doctor` scans local skill packages for frontmatter issues, broken resource references, weak trigger descriptions, missing workflow guidance, and malformed `evals/evals.json`, then turns the result into a **0-100 score** with actionable findings.

## How it works

`skill-doctor` walks a single skill root or a whole workspace, discovers every `SKILL.md`, and runs a static analysis pass over:

1. **Spec and metadata**: frontmatter presence, YAML validity, `name`, `description`, and basic compatibility with common skill conventions.
2. **Bundle integrity**: broken local links, references that escape the skill root, empty helper files, and missing resource files.
3. **Trigger quality**: whether the description clearly says what the skill does and when it should trigger.
4. **Instruction quality**: whether the body provides enough workflow or usage guidance to be actionable.
5. **Eval hygiene**: optional validation for `evals/evals.json`, including schema shape, duplicate IDs, missing input files, and mismatched skill names.

The scoring model is intentionally conservative in default mode. Strong real-world skills should score cleanly or near-cleanly. Stricter guidance is available through `--strictness strict` and `--strictness pedantic`.

## Install

Run this at the root of a skill or skill workspace:

```bash
npx -y skill-doctor@latest .
```

Show affected files and line numbers:

```bash
npx -y skill-doctor@latest . --verbose
```

Get just the numeric score:

```bash
npx -y skill-doctor@latest . --score
```

Machine-readable output:

```bash
npx -y skill-doctor@latest . --format json
```

## Example output

```text
  ┌─────┐
  │ ◠ ◠ │
  │  ▽  │
  └─────┘
  Skill Doctor (static skill diagnostics)

 ┌─────────────────────────────┐
 │  Score: 99 / 100 Excellent  │
 │  Skills: 17                 │
 │  Healthy: 15                │
 │  Errors: 0                  │
 │  Warnings: 2                │
 │  Time: 28ms                 │
 └─────────────────────────────┘
```

## GitHub Actions

```yaml
- uses: actions/checkout@v5
- uses: marian2js/skill-doctor@main
  with:
    directory: .
    strictness: default
    fail-on: error
```

| Input          | Default   | Description                                           |
| -------------- | --------- | ----------------------------------------------------- |
| `directory`    | `.`       | Skill directory or workspace to scan                  |
| `verbose`      | `true`    | Show file details per finding                         |
| `fail-on`      | `error`   | Exit with error code on `error`, `warning`, or `none` |
| `strictness`   | `default` | Analysis strictness: `default`, `strict`, `pedantic`  |
| `node-version` | `20`      | Node.js version to use                                |

The action outputs a `score` value you can use in later workflow steps.

## Options

```text
Usage: skill-doctor [directory] [options]

Options:
  -v, --version              display the version number
  --format <format>          output format: text or json
  --fail-on <level>          exit with error code on diagnostics: error, warning, none
  --strictness <level>       analysis strictness: default, strict, pedantic
  --verbose                  show file details per rule
  --score                    output only the score
  -h, --help                 display help for command
```

## Node.js API

You can also use `skill-doctor` programmatically:

```ts
import { diagnose } from "skill-doctor";

const result = await diagnose("/path/to/skills");

console.log(result.score); // { score: 99, label: "Excellent" }
console.log(result.skills); // per-skill breakdown
console.log(result.diagnostics); // flattened findings across the workspace
```

## Calibration

The analyzer was designed with a mix of sources:

- the CLI shape and reporting style in [react-doctor](https://github.com/millionco/react-doctor)
- Firety's `skill lint` rule taxonomy and reporting model
- Anthropic's `skill-creator` workflow and eval schema
- Agent Skills guidance on [specification](https://agentskills.io/specification), [best practices](https://agentskills.io/skill-creation/best-practices), [optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions), [evaluating skills](https://agentskills.io/skill-creation/evaluating-skills), and [using scripts](https://agentskills.io/skill-creation/using-scripts)

The default heuristics were calibrated against Anthropic's public skill corpus so high-quality skills do not get buried in noisy style warnings.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Run the CLI locally:

```bash
node packages/skill-doctor/dist/cli.js /path/to/skills
```

More contribution details live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT, see [LICENSE](./LICENSE).
