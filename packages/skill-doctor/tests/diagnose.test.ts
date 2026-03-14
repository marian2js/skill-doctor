import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnose } from "../src/index.js";
import { createTempWorkspace } from "./test-utils.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("diagnose", () => {
  it("returns a clean score for a well-formed skill", async () => {
    const root = createTempWorkspace({
      "clean-skill/SKILL.md": `---
name: clean-skill
description: Use this skill when the user asks for release notes, changelog summaries, or launch recaps.
---

# Clean Skill

## Overview

Turn raw product updates into concise release notes.

## Workflow

1. Review the source material.
2. Group updates by theme.
3. Produce a concise release summary.

See [reference guide](references/guide.md).
`,
      "clean-skill/references/guide.md": "Reference material",
    });
    tempRoots.push(root);

    const result = await diagnose(path.join(root, "clean-skill"));

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].skill.name).toBe("clean-skill");
    expect(result.skills[0].diagnostics).toHaveLength(0);
    expect(result.score.score).toBe(100);
  });

  it("finds broken links and missing metadata", async () => {
    const root = createTempWorkspace({
      "broken-skill/SKILL.md": `---
name: broken-skill
---

# Broken Skill

Read [missing reference](references/missing.md).
`,
    });
    tempRoots.push(root);

    const result = await diagnose(path.join(root, "broken-skill"));
    const ruleIds = result.diagnostics.map((diagnostic) => diagnostic.ruleId);

    expect(ruleIds).toContain("skill.missing-frontmatter-description");
    expect(ruleIds).toContain("skill.broken-local-link");
  });

  it("validates eval files when present", async () => {
    const root = createTempWorkspace({
      "eval-skill/SKILL.md": `---
name: eval-skill
description: Use this skill when the user wants a policy summary from a local markdown document.
---

# Eval Skill

## Quick Start

Summarize the provided document.
`,
      "eval-skill/evals/evals.json": JSON.stringify(
        {
          skill_name: "different-skill",
          evals: [
            {
              id: 1,
              prompt: "",
              expected_output: "",
              files: ["evals/files/missing.md"],
            },
            {
              id: 1,
              prompt: "Summarize the input",
              expected_output: "A summary",
              expectations: [1, 2],
            },
          ],
        },
        null,
        2,
      ),
    });
    tempRoots.push(root);

    const result = await diagnose(path.join(root, "eval-skill"));
    const ruleIds = result.diagnostics.map((diagnostic) => diagnostic.ruleId);

    expect(ruleIds).toContain("evals.skill-name-mismatch");
    expect(ruleIds).toContain("evals.empty-prompt");
    expect(ruleIds).toContain("evals.missing-file");
    expect(ruleIds).toContain("evals.duplicate-id");
    expect(ruleIds).toContain("evals.invalid-expectations");
    expect(ruleIds).toContain("evals.missing-expected-output");
  });

  it("discovers multiple skills in a workspace", async () => {
    const root = createTempWorkspace({
      "workspace/skill-one/SKILL.md": `---
name: skill-one
description: Use this skill when the user asks for deployment checklists.
---

# Skill One

## Workflow

Create a deployment checklist.
`,
      "workspace/skill-two/SKILL.md": `---
name: skill-two
description: Use this skill when the user asks for sprint retrospectives.
---

# Skill Two

## Workflow

Create a retrospective summary.
`,
      "workspace/node_modules/ignored/SKILL.md": `---
name: ignored
description: Use this skill when the user asks for ignored things.
---
`,
    });
    tempRoots.push(root);

    const result = await diagnose(path.join(root, "workspace"));

    expect(result.skills).toHaveLength(2);
    expect(result.skills.map((skill) => skill.skill.name)).toEqual(["skill-one", "skill-two"]);
    expect(result.skippedPaths.some((skippedPath) => skippedPath.includes("node_modules"))).toBe(
      true,
    );
  });
});
