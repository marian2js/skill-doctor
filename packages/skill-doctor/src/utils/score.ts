import { findRule } from "../rules.js";
import type { Diagnostic, ScoreResult } from "../types.js";
import { clampScore, labelForScore } from "./colorize-by-score.js";
import { groupBy } from "./group-by.js";

const severityMultiplier = {
  error: 18,
  warning: 6,
} as const;

export const calculateScore = (diagnostics: Diagnostic[]): ScoreResult => {
  if (diagnostics.length === 0) {
    return { score: 100, label: labelForScore(100) };
  }

  const diagnosticsByRule = groupBy(diagnostics, (diagnostic) => diagnostic.ruleId);
  let penalty = 0;

  for (const [ruleId, ruleDiagnostics] of diagnosticsByRule) {
    const rule = findRule(ruleId);
    const weight = rule?.weight ?? 1;
    const cappedCount = Math.min(ruleDiagnostics.length, 3);
    penalty += cappedCount * weight * severityMultiplier[ruleDiagnostics[0].severity];
  }

  const score = clampScore(100 - penalty);
  return {
    score,
    label: labelForScore(score),
  };
};

export const averageScore = (scores: ScoreResult[]): ScoreResult => {
  if (scores.length === 0) {
    return { score: 0, label: labelForScore(0) };
  }

  const average = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
  const rounded = clampScore(average);
  return {
    score: rounded,
    label: labelForScore(rounded),
  };
};
