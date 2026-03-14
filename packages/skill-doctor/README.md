# skill-doctor

Diagnose static quality issues in agent skills.

Repository docs live at [github.com/marian2js/skill-doctor](https://github.com/marian2js/skill-doctor).

## Install

```bash
npx -y skill-doctor@latest .
```

## Usage

```bash
skill-doctor /path/to/skills
skill-doctor /path/to/skills --verbose
skill-doctor /path/to/skills --format json
skill-doctor /path/to/skills --strictness strict
skill-doctor /path/to/skills --score
```

## API

```ts
import { diagnose } from "skill-doctor";

const result = await diagnose("/path/to/skills");
console.log(result.score);
```
