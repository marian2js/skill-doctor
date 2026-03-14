import path from "node:path";
import pc from "picocolors";
import {
  HEADER_INDENT_CHARS,
  HEADER_MIN_SPLIT_WIDTH_CHARS,
  HEADER_TARGET_WIDTH_CHARS,
  PERFECT_SCORE,
  SCORE_BAR_WIDTH_CHARS,
} from "./constants.js";
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

const formatElapsedTime = (elapsedMilliseconds: number): string => {
  if (elapsedMilliseconds < 1_000) {
    return `${Math.round(elapsedMilliseconds)}ms`;
  }
  return `${(elapsedMilliseconds / 1_000).toFixed(1)}s`;
};

const getHeaderWidth = (): number =>
  Math.max(
    HEADER_MIN_SPLIT_WIDTH_CHARS,
    Math.min(process.stdout.columns ?? HEADER_TARGET_WIDTH_CHARS, HEADER_TARGET_WIDTH_CHARS),
  );

const renderSplitLine = (
  leftPlainText: string,
  leftRenderedText: string,
  rightPlainText: string,
  rightRenderedText: string,
): string[] => {
  const innerWidth = getHeaderWidth() - HEADER_INDENT_CHARS;
  const minimumGapChars = 4;

  if (leftPlainText.length + rightPlainText.length + minimumGapChars > innerWidth) {
    return [`  ${leftRenderedText}`, `  ${rightRenderedText}`];
  }

  const spacing = " ".repeat(innerWidth - leftPlainText.length - rightPlainText.length);
  return [`  ${leftRenderedText}${spacing}${rightRenderedText}`];
};

const joinSummaryParts = (parts: string[]): string => {
  const separator = highlighter.dim(" • ");
  return parts.join(separator);
};

const printSectionHeading = (title: string) => {
  logger.log(`  ${pc.bold(title)}`);
  logger.log(`  ${highlighter.dim("─".repeat(Math.max(24, title.length + 10)))}`);
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
  const scoreStateLabel =
    score === 100 ? "perfect" : score >= 90 ? "excellent" : score >= 75 ? "healthy" : "needs work";
  const headerLines = renderSplitLine(
    "skill doctor",
    pc.bold(colorizeByScore("skill doctor", score)),
    `${score} ${scoreStateLabel}`,
    `${pc.bold(colorizeByScore(`${score}`, score))} ${colorizeByScore(scoreStateLabel, score)}`,
  );

  for (const headerLine of headerLines) {
    logger.log(headerLine);
  }

  logger.log(`  ${highlighter.dim("static diagnostics for agent skills")}`);
  logger.log(
    `  ${joinSummaryParts([
      highlighter.info("metadata"),
      highlighter.success("bundle integrity"),
      highlighter.warn("trigger quality"),
      highlighter.dim("eval hygiene"),
    ])}`,
  );
  logger.break();
};

const printSummary = (result: WorkspaceDiagnosisResult) => {
  const errorCount = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = result.diagnostics.length - errorCount;
  const healthySkillCount = result.skills.filter((skill) => skill.diagnostics.length === 0).length;

  logger.log(
    `  ${joinSummaryParts([
      `${pc.bold(String(result.skills.length))} skills scanned`,
      `${highlighter.success(String(healthySkillCount))} healthy`,
      errorCount > 0 ? highlighter.error(`${errorCount} errors`) : highlighter.dim("0 errors"),
      warningCount > 0
        ? highlighter.warn(`${warningCount} warnings`)
        : highlighter.dim("0 warnings"),
      highlighter.info(formatElapsedTime(result.elapsedMilliseconds)),
    ])}`,
  );
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

  printSectionHeading("workspace overview");
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

  printSectionHeading("finding details");
  logger.break();

  for (const skill of skillsWithFindings) {
    printDiagnosticGroups(skill, options);
  }
};
