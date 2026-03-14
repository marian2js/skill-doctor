import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createTempWorkspace } from "./test-utils.js";

const tempRoots: string[] = [];
const cliPath = path.resolve(import.meta.dirname, "../dist/cli.js");

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("cli", () => {
  it("prints text output and fails on warnings when requested", () => {
    const root = createTempWorkspace({
      "warn-skill/SKILL.md": `---
name: warn-skill
description: Use this skill when the user asks for roadmap notes.
---

# Warn Skill

Read [missing reference](references/missing.md).
`,
    });
    tempRoots.push(root);

    const result = spawnSync(
      process.execPath,
      [cliPath, path.join(root, "warn-skill"), "--fail-on", "warning"],
      {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("skill doctor");
    expect(result.stdout).toContain("details");
    expect(result.stdout).toContain("references/missing.md");
  });

  it("emits machine-readable JSON", () => {
    const root = createTempWorkspace({
      "json-skill/SKILL.md": `---
name: json-skill
description: Use this skill when the user asks for incident summaries.
---

# JSON Skill

## Overview

Turn a raw incident timeline into an executive-ready summary for stakeholders.

## Workflow

1. Review the incident timeline.
2. Group the events by impact and root cause.
3. Produce a concise summary with next steps.

## Reference

Keep the tone factual and concise.
`,
    });
    tempRoots.push(root);

    const stdout = execFileSync(
      process.execPath,
      [cliPath, path.join(root, "json-skill"), "--format", "json"],
      {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        maxBuffer: 1024 * 1024,
      },
    );

    const payload = JSON.parse(stdout) as {
      score: { score: number };
      skills: Array<{ skill: { name: string } }>;
    };

    expect(payload.score.score).toBe(100);
    expect(payload.skills[0].skill.name).toBe("json-skill");
  });
});
