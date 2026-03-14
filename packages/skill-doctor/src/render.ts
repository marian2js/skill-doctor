import path from "node:path";
import pc from "picocolors";
import { PERFECT_SCORE, SCORE_BAR_WIDTH_CHARS } from "./constants.js";
import { findRule } from "./rules.js";
import type {
  Diagnostic,
  ScanOptions,
  SkillDiagnosisResult,
  WorkspaceDiagnosisResult,
} from "./types.js";
import { colorizeByScore } from "./utils/colorize-by-score.js";
import { groupBy } from "./utils/group-by.js";
import { highlighter } from "./utils/highlighter.js";
import { indentMultilineText } from "./utils/indent-multiline-text.js";
import { logger } from "./utils/logger.js";

const SEVERITY_ORDER: Record<Diagnostic["severity"], number> = {
  error: 0,
  warning: 1,
};

const buildScoreBar = (score: number): string => {
  const filledCount = Math.round((score / PERFECT_SCORE) * SCORE_BAR_WIDTH_CHARS);
  const emptyCount = SCORE_BAR_WIDTH_CHARS - filledCount;
  const filled = "█".repeat(filledCount);
  const empty = "░".repeat(emptyCount);
  return colorizeByScore(filled, score) + highlighter.dim(empty);
};

const createChip = (label: string, tone: "info" | "success" | "warning" | "neutral"): string => {
  if (tone === "info") return pc.bold(pc.bgCyan(pc.black(` ${label} `)));
  if (tone === "success") return pc.bold(pc.bgGreen(pc.black(` ${label} `)));
  if (tone === "warning") return pc.bold(pc.bgYellow(pc.black(` ${label} `)));
  return pc.bold(pc.bgWhite(pc.black(` ${label} `)));
};

const formatElapsedTime = (elapsedMilliseconds: number): string => {
  if (elapsedMilliseconds < 1_000) {
    return `${Math.round(elapsedMilliseconds)}ms`;
  }
  return `${(elapsedMilliseconds / 1_000).toFixed(1)}s`;
};

const formatFindingCount = (skill: SkillDiagnosisResult): string => {
  const errorCount = skill.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = skill.diagnostics.length - errorCount;

  if (errorCount === 0 && warningCount === 0) {
    return highlighter.success("clean");
  }

  if (errorCount > 0 && warningCount > 0) {
    return `${highlighter.error(`${errorCount} err`)} ${highlighter.warn(`${warningCount} warn`)}`;
  }

  if (errorCount > 0) {
    return highlighter.error(`${errorCount} err`);
  }

  return highlighter.warn(`${warningCount} warn`);
};

const printBranding = (score: number) => {
  logger.log(`  ${pc.bold(colorizeByScore("skill doctor", score))}`);
  logger.log(`  ${highlighter.dim("static diagnostics for agent skills")}`);
  logger.log(
    `  ${createChip("metadata", "info")} ${createChip("bundle", "success")} ${createChip("triggers", "warning")} ${createChip("evals", "neutral")}`,
  );
  logger.break();
};

const printSummary = (result: WorkspaceDiagnosisResult) => {
  const errorCount = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = result.diagnostics.length - errorCount;
  const healthySkillCount = result.skills.filter((skill) => skill.diagnostics.length === 0).length;
  const findingsTone = errorCount > 0 ? "warning" : warningCount > 0 ? "warning" : "success";

  logger.log(
    `  ${createChip("score", "info")} ${colorizeByScore(`${result.score.score}`, result.score.score)} / ${PERFECT_SCORE} ${colorizeByScore(result.score.label, result.score.score)}`,
  );
  logger.log(
    `  ${createChip("coverage", "neutral")} ${result.skills.length} skills • ${healthySkillCount} healthy`,
  );
  logger.log(
    `  ${createChip("findings", findingsTone)} ${errorCount} errors • ${warningCount} warnings`,
  );
  logger.log(`  ${createChip("time", "neutral")} ${formatElapsedTime(result.elapsedMilliseconds)}`);
  logger.log(`  ${buildScoreBar(result.score.score)}`);
  logger.break();
};

const printSkillTable = (skills: SkillDiagnosisResult[]) => {
  const sortedSkills = [...skills].sort((left, right) => {
    if (left.score.score !== right.score.score) {
      return left.score.score - right.score.score;
    }
    return left.skill.name.localeCompare(right.skill.name);
  });

  const skillColumnWidth = Math.max(...sortedSkills.map((skill) => skill.skill.name.length), 5);

  logger.log(`  ${createChip("workspace", "neutral")} skill overview`);
  logger.log(
    `  ${highlighter.dim("name".padEnd(skillColumnWidth + 2))}${highlighter.dim("score".padEnd(8))}${highlighter.dim("findings")}`,
  );

  for (const skill of sortedSkills) {
    const paddedName = skill.skill.name.padEnd(skillColumnWidth);
    const scoreText = colorizeByScore(
      String(skill.score.score).padStart(3, " "),
      skill.score.score,
    );
    logger.log(`  ${paddedName}  ${scoreText}   ${formatFindingCount(skill)}`);
  }

  logger.break();
};

const sortDiagnosticGroups = (
  diagnosticGroups: [string, Diagnostic[]][],
): [string, Diagnostic[]][] =>
  [...diagnosticGroups].sort(([, diagnosticsA], [, diagnosticsB]) => {
    const severityA = SEVERITY_ORDER[diagnosticsA[0].severity];
    const severityB = SEVERITY_ORDER[diagnosticsB[0].severity];
    if (severityA !== severityB) {
      return severityA - severityB;
    }
    return diagnosticsA[0].ruleId.localeCompare(diagnosticsB[0].ruleId);
  });

const formatLocation = (skill: SkillDiagnosisResult, diagnostic: Diagnostic): string => {
  const resolvedPath = path.isAbsolute(diagnostic.filePath)
    ? path.relative(skill.skill.rootDirectory, diagnostic.filePath)
    : diagnostic.filePath;
  return diagnostic.line > 0 ? `${resolvedPath}:${diagnostic.line}` : resolvedPath;
};

const printDiagnosticGroups = (skill: SkillDiagnosisResult, options: ScanOptions) => {
  const grouped = groupBy(skill.diagnostics, (diagnostic) => diagnostic.ruleId);
  const sortedGroups = sortDiagnosticGroups([...grouped.entries()]);

  logger.log(
    `${colorizeByScore(skill.skill.name, skill.score.score)} ${highlighter.dim(`(${skill.score.score}/${PERFECT_SCORE})`)}`,
  );

  for (const [ruleId, diagnostics] of sortedGroups) {
    const firstDiagnostic = diagnostics[0];
    const icon =
      firstDiagnostic.severity === "error" ? highlighter.error("✗") : highlighter.warn("⚠");
    const countLabel = diagnostics.length > 1 ? highlighter.dim(` (${diagnostics.length})`) : "";
    const rule = findRule(ruleId);
    const locationSummary = formatLocation(skill, firstDiagnostic);

    logger.log(`  ${icon} ${firstDiagnostic.message}${countLabel}`);
    if (rule) {
      logger.dim(indentMultilineText(rule.help, "    "));
    } else {
      logger.dim(indentMultilineText(firstDiagnostic.help, "    "));
    }

    if (options.verbose) {
      for (const diagnostic of diagnostics) {
        logger.dim(`    ${formatLocation(skill, diagnostic)}`);
      }
    } else {
      const suffix =
        diagnostics.length > 1 ? ` ${highlighter.dim(`(+${diagnostics.length - 1} more)`)}` : "";
      logger.dim(`    ${locationSummary}${suffix}`);
    }

    logger.break();
  }
};

export const printTextReport = (result: WorkspaceDiagnosisResult, options: ScanOptions) => {
  printBranding(result.score.score);
  printSummary(result);
  printSkillTable(result.skills);

  const skillsWithFindings = result.skills.filter((skill) => skill.diagnostics.length > 0);
  if (skillsWithFindings.length === 0) {
    logger.success(
      `No issues found across ${result.skills.length} skill${result.skills.length === 1 ? "" : "s"}.`,
    );
    return;
  }

  logger.log(`  ${createChip("findings", "warning")} details`);
  logger.break();

  for (const skill of skillsWithFindings) {
    printDiagnosticGroups(skill, options);
  }
};
