import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeSkill } from "./analyze-skill.js";
import { rules, severityForRule } from "./rules.js";
import type { DiagnoseOptions, Diagnostic, SkillInfo, WorkspaceDiagnosisResult } from "./types.js";
import { discoverSkills } from "./utils/discover-skills.js";
import { averageScore, calculateScore } from "./utils/score.js";

export const diagnose = async (
  directory: string,
  options: DiagnoseOptions = {},
): Promise<WorkspaceDiagnosisResult> => {
  const strictness = options.strictness ?? "default";
  const startTime = performance.now();
  const diagnostics: Diagnostic[] = [];
  const skillResults = [];

  if (!fs.existsSync(directory)) {
    const skill: SkillInfo = {
      name: path.basename(directory),
      rootDirectory: path.dirname(directory),
      skillFilePath: directory,
      inventory: {
        resourceDirectories: [],
        hasEvals: false,
        evalsPath: null,
        fileCount: 0,
      },
    };
    diagnostics.push({
      skillName: skill.name,
      skillPath: skill.rootDirectory,
      filePath: directory,
      ruleId: rules.targetNotFound.id,
      severity: severityForRule(rules.targetNotFound, strictness),
      message: rules.targetNotFound.description,
      help: rules.targetNotFound.help,
      category: rules.targetNotFound.category,
      line: 0,
    });
    return {
      rootDirectory: directory,
      skills: [],
      diagnostics,
      score: calculateScore(diagnostics),
      elapsedMilliseconds: performance.now() - startTime,
      skippedPaths: [],
    };
  }

  const stat = fs.statSync(directory);
  const normalizedTarget =
    stat.isFile() && path.basename(directory).toLowerCase() === "skill.md"
      ? path.dirname(directory)
      : directory;

  if (stat.isFile() && path.basename(directory).toLowerCase() !== "skill.md") {
    diagnostics.push({
      skillName: path.basename(directory),
      skillPath: path.dirname(directory),
      filePath: directory,
      ruleId: rules.targetNotDirectory.id,
      severity: severityForRule(rules.targetNotDirectory, strictness),
      message: rules.targetNotDirectory.description,
      help: rules.targetNotDirectory.help,
      category: rules.targetNotDirectory.category,
      line: 0,
    });
    return {
      rootDirectory: directory,
      skills: [],
      diagnostics,
      score: calculateScore(diagnostics),
      elapsedMilliseconds: performance.now() - startTime,
      skippedPaths: [],
    };
  }

  const discovery = discoverSkills(normalizedTarget);
  if (discovery.skillRoots.length === 0) {
    diagnostics.push({
      skillName: path.basename(normalizedTarget),
      skillPath: normalizedTarget,
      filePath: normalizedTarget,
      ruleId: rules.noSkillsFound.id,
      severity: severityForRule(rules.noSkillsFound, strictness),
      message: rules.noSkillsFound.description,
      help: rules.noSkillsFound.help,
      category: rules.noSkillsFound.category,
      line: 0,
    });
    return {
      rootDirectory: normalizedTarget,
      skills: [],
      diagnostics,
      score: calculateScore(diagnostics),
      elapsedMilliseconds: performance.now() - startTime,
      skippedPaths: discovery.skippedPaths,
    };
  }

  for (const skillRoot of discovery.skillRoots) {
    const result = analyzeSkill(skillRoot, strictness);
    diagnostics.push(...result.diagnostics);
    skillResults.push(result);
  }

  return {
    rootDirectory: normalizedTarget,
    skills: skillResults,
    diagnostics,
    score: averageScore(skillResults.map((skill) => skill.score)),
    elapsedMilliseconds: performance.now() - startTime,
    skippedPaths: discovery.skippedPaths,
  };
};
