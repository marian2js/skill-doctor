export type Severity = "error" | "warning";
export type FailOnLevel = "error" | "warning" | "none";
export type OutputFormat = "text" | "json";
export type Strictness = "default" | "strict" | "pedantic";

export interface RuleDefinition {
  id: string;
  title: string;
  category: string;
  defaultSeverity: Severity;
  strictSeverity?: Severity;
  pedanticSeverity?: Severity;
  description: string;
  why: string;
  help: string;
  weight?: number;
}

export interface Diagnostic {
  skillName: string;
  skillPath: string;
  filePath: string;
  ruleId: string;
  severity: Severity;
  message: string;
  help: string;
  category: string;
  line: number;
}

export interface ResourceReference {
  destination: string;
  line: number;
  source: "code-span" | "link" | "plain-path";
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface FrontmatterIssue {
  message: string;
  line: number;
}

export interface FrontmatterData {
  present: boolean;
  valid: boolean;
  startLine: number;
  endLine: number;
  data: Record<string, unknown>;
  issues: FrontmatterIssue[];
}

export interface SkillDocument {
  rootDirectory: string;
  skillFilePath: string;
  content: string;
  body: string;
  bodyStartLine: number;
  headings: Heading[];
  resourceReferences: ResourceReference[];
  codeFenceCount: number;
  lineCount: number;
  byteSize: number;
  frontmatter: FrontmatterData;
}

export interface SkillInventory {
  resourceDirectories: string[];
  hasEvals: boolean;
  evalsPath: string | null;
  fileCount: number;
}

export interface SkillInfo {
  name: string;
  rootDirectory: string;
  skillFilePath: string;
  inventory: SkillInventory;
}

export interface SkillDiagnosisResult {
  skill: SkillInfo;
  diagnostics: Diagnostic[];
  score: ScoreResult;
}

export interface WorkspaceDiagnosisResult {
  rootDirectory: string;
  skills: SkillDiagnosisResult[];
  diagnostics: Diagnostic[];
  score: ScoreResult;
  elapsedMilliseconds: number;
  skippedPaths: string[];
}

export interface ScoreResult {
  score: number;
  label: string;
}

export interface DiagnoseOptions {
  strictness?: Strictness;
}

export interface ScanOptions extends DiagnoseOptions {
  format?: OutputFormat;
  failOn?: FailOnLevel;
  verbose?: boolean;
  scoreOnly?: boolean;
}
