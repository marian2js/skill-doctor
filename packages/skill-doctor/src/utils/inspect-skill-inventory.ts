import fs from "node:fs";
import path from "node:path";
import { RESOURCE_DIRECTORY_NAMES } from "../constants.js";
import type { SkillInventory } from "../types.js";

const countFilesRecursive = (directory: string): number => {
  let fileCount = 0;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile()) {
      fileCount += 1;
      continue;
    }
    if (entry.isDirectory()) {
      fileCount += countFilesRecursive(entryPath);
    }
  }

  return fileCount;
};

export const inspectSkillInventory = (skillRoot: string): SkillInventory => {
  const resourceDirectories: string[] = [];

  for (const directoryName of RESOURCE_DIRECTORY_NAMES) {
    const directoryPath = path.join(skillRoot, directoryName);
    if (fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory()) {
      resourceDirectories.push(directoryName);
    }
  }

  const evalsPath = path.join(skillRoot, "evals", "evals.json");

  return {
    resourceDirectories,
    hasEvals: fs.existsSync(evalsPath),
    evalsPath: fs.existsSync(evalsPath) ? evalsPath : null,
    fileCount: countFilesRecursive(skillRoot),
  };
};
