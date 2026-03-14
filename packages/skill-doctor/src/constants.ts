export const PERFECT_SCORE = 100;
export const SCORE_BAR_WIDTH_CHARS = 24;
export const SCORE_GOOD_THRESHOLD = 90;
export const SCORE_OK_THRESHOLD = 75;
export const HEADER_TARGET_WIDTH_CHARS = 72;
export const HEADER_MIN_SPLIT_WIDTH_CHARS = 56;
export const HEADER_INDENT_CHARS = 2;

export const SUMMARY_BOX_HORIZONTAL_PADDING_CHARS = 2;
export const SUMMARY_BOX_OUTER_INDENT_CHARS = 1;

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".next",
  ".turbo",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tmp",
]);

export const ALLOWED_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "compatibility",
  "allowed-tools",
  "license",
  "metadata",
]);

export const RESOURCE_DIRECTORY_NAMES = ["agents", "assets", "evals", "references", "scripts"];
