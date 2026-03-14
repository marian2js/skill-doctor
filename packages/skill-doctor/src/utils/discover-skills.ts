import fs from "node:fs";
import path from "node:path";
import { DEFAULT_IGNORED_DIRECTORIES } from "../constants.js";

export interface DiscoveryResult {
  rootDirectory: string;
  skillRoots: string[];
  skippedPaths: string[];
}

const sortPaths = (paths: string[]): string[] =>
  [...paths].sort((left, right) => left.localeCompare(right));

const discoverRecursive = (directory: string, roots: Set<string>, skippedPaths: Set<string>) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  const containsSkillMd = entries.some(
    (entry) => entry.isFile() && entry.name.toLowerCase() === "skill.md",
  );
  if (containsSkillMd) {
    roots.add(directory);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
      skippedPaths.add(path.join(directory, entry.name));
      continue;
    }
    discoverRecursive(path.join(directory, entry.name), roots, skippedPaths);
  }
};

export const discoverSkills = (target: string): DiscoveryResult => {
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    if (path.basename(target).toLowerCase() !== "skill.md") {
      return {
        rootDirectory: path.dirname(target),
        skillRoots: [],
        skippedPaths: [],
      };
    }

    return {
      rootDirectory: path.dirname(target),
      skillRoots: [path.dirname(target)],
      skippedPaths: [],
    };
  }

  const roots = new Set<string>();
  const skippedPaths = new Set<string>();
  discoverRecursive(target, roots, skippedPaths);

  return {
    rootDirectory: target,
    skillRoots: sortPaths([...roots]),
    skippedPaths: sortPaths([...skippedPaths]),
  };
};
