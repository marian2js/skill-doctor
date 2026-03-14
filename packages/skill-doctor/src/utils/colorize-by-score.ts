import { PERFECT_SCORE, SCORE_GOOD_THRESHOLD, SCORE_OK_THRESHOLD } from "../constants.js";
import { highlighter } from "./highlighter.js";

export const colorizeByScore = (text: string, score: number): string => {
  if (score >= SCORE_GOOD_THRESHOLD) return highlighter.success(text);
  if (score >= SCORE_OK_THRESHOLD) return highlighter.warn(text);
  return highlighter.error(text);
};

export const labelForScore = (score: number): string => {
  if (score >= 96) return "Excellent";
  if (score >= 88) return "Strong";
  if (score >= 75) return "Healthy";
  if (score >= 60) return "Needs polish";
  if (score >= 40) return "Risky";
  return "Critical";
};

export const clampScore = (score: number): number =>
  Math.max(0, Math.min(PERFECT_SCORE, Math.round(score)));
