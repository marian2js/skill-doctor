import fs from "node:fs";
import path from "node:path";
import {
  rules,
  severityForRule,
} from "./rules.js";
import type {
  Diagnostic,
  RuleDefinition,
  Severity,
  SkillDiagnosisResult,
  SkillDocument,
  SkillInfo,
  Strictness,
} from "./types.js";
import { inspectSkillInventory } from "./utils/inspect-skill-inventory.js";
import { readSkillDocument } from "./utils/read-skill-document.js";
import { calculateScore } from "./utils/score.js";

const EXTERNAL_DESTINATION_PATTERN = /^(?:[a-z]+:)?\/\//i;
const TRIGGER_LANGUAGE_PATTERN =
  /\b(use (?:this skill )?(?:when|whenever|for)|use this when|use it when|triggers? include|trigger when|whenever|if the user|when the user|when user|do not trigger|do not use)\b/i;
const GENERIC_DESCRIPTION_PATTERN =
  /\b(helper|assistant|toolkit|various tasks|general tasks|many tasks|different tasks|miscellaneous)\b/i;
const USAGE_GUIDANCE_PATTERN =
  /\b(quick start|workflow|usage|how to use|process|steps|when to use|overview|reading guide|decision tree|guidelines|best practices|instructions|playbook|reference)\b/i;
const NON_EMPTY_LINE_PATTERN = /\S/;

const normalizeHeading = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");

const isKebabCase = (value: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const getRelativePath = (filePath: string, rootDirectory: string): string => {
  const relativePath = path.relative(rootDirectory, filePath);
  return relativePath === "" ? "SKILL.md" : relativePath;
};

const createDiagnostic = (
  rule: RuleDefinition,
  severity: Severity,
  skill: SkillInfo,
  filePath: string,
  line: number,
  message?: string,
): Diagnostic => ({
  skillName: skill.name,
  skillPath: skill.rootDirectory,
  filePath,
  ruleId: rule.id,
  severity,
  message: message ?? rule.description,
  help: rule.help,
  category: rule.category,
  line,
});

const maybeLocalDestination = (destination: string): string | null => {
  if (!destination) return null;
  if (destination.startsWith("#")) return null;
  if (EXTERNAL_DESTINATION_PATTERN.test(destination)) return null;
  if (destination.startsWith("mailto:")) return null;
  return destination.split("#", 1)[0].split("?", 1)[0];
};

const collectReferenceDiagnostics = (
  skill: SkillInfo,
  document: SkillDocument,
  strictness: Strictness,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const reference of document.resourceReferences) {
    const cleanedDestination = maybeLocalDestination(reference.destination);
    if (!cleanedDestination) continue;

    const resolvedPath = path.resolve(skill.rootDirectory, cleanedDestination);
    const relativeToRoot = path.relative(skill.rootDirectory, resolvedPath);
    const escapesRoot =
      relativeToRoot === "" ? false : relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot);

    if (escapesRoot) {
      diagnostics.push(
        createDiagnostic(
          rules.referenceOutsideRoot,
          severityForRule(rules.referenceOutsideRoot, strictness),
          skill,
          getRelativePath(document.skillFilePath, skill.rootDirectory),
          reference.line,
          `Local reference \`${reference.destination}\` resolves outside the skill root.`,
        ),
      );
      continue;
    }

    if (!fs.existsSync(resolvedPath)) {
      const rule = reference.source === "link" ? rules.brokenLocalLink : rules.missingMentionedResource;
      diagnostics.push(
        createDiagnostic(
          rule,
          severityForRule(rule, strictness),
          skill,
          getRelativePath(document.skillFilePath, skill.rootDirectory),
          reference.line,
          `Referenced resource \`${reference.destination}\` was not found.`,
        ),
      );
      continue;
    }

    const stat = fs.statSync(resolvedPath);
    if (reference.source === "link" && stat.isDirectory()) {
      diagnostics.push(
        createDiagnostic(
          rules.referencedDirectory,
          severityForRule(rules.referencedDirectory, strictness),
          skill,
          getRelativePath(document.skillFilePath, skill.rootDirectory),
          reference.line,
          `Local link \`${reference.destination}\` points to a directory.`,
        ),
      );
      continue;
    }

    if (stat.isFile() && stat.size === 0) {
      diagnostics.push(
        createDiagnostic(
          rules.emptyReferencedResource,
          severityForRule(rules.emptyReferencedResource, strictness),
          skill,
          getRelativePath(resolvedPath, skill.rootDirectory),
          1,
          `Referenced resource \`${reference.destination}\` is empty.`,
        ),
      );
    }
  }

  return diagnostics;
};

const collectEvalsDiagnostics = (skill: SkillInfo, strictness: Strictness): Diagnostic[] => {
  if (!skill.inventory.evalsPath) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  let payload: unknown;

  try {
    payload = JSON.parse(fs.readFileSync(skill.inventory.evalsPath, "utf8"));
  } catch (error) {
    diagnostics.push(
      createDiagnostic(
        rules.invalidEvalsJson,
        severityForRule(rules.invalidEvalsJson, strictness),
        skill,
        getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
        1,
        error instanceof Error
          ? `Could not parse \`evals/evals.json\`: ${error.message}`
          : "Could not parse `evals/evals.json`.",
      ),
    );
    return diagnostics;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    diagnostics.push(
      createDiagnostic(
        rules.invalidEvalsSchema,
        severityForRule(rules.invalidEvalsSchema, strictness),
        skill,
        getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
        1,
      ),
    );
    return diagnostics;
  }

  const record = payload as Record<string, unknown>;
  const skillName = record.skill_name;
  const evals = record.evals;

  if (typeof skillName !== "string" || !Array.isArray(evals)) {
    diagnostics.push(
      createDiagnostic(
        rules.invalidEvalsSchema,
        severityForRule(rules.invalidEvalsSchema, strictness),
        skill,
        getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
        1,
      ),
    );
    return diagnostics;
  }

  if (skillName !== skill.name) {
    diagnostics.push(
      createDiagnostic(
        rules.evalsSkillNameMismatch,
        severityForRule(rules.evalsSkillNameMismatch, strictness),
        skill,
        getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
        1,
        `Evals declare \`${skillName}\`, but SKILL.md uses \`${skill.name}\`.`,
      ),
    );
  }

  const seenIds = new Set<number>();

  for (const [index, evalEntry] of evals.entries()) {
    const line = index + 1;

    if (!evalEntry || typeof evalEntry !== "object" || Array.isArray(evalEntry)) {
      diagnostics.push(
        createDiagnostic(
          rules.invalidEvalsSchema,
          severityForRule(rules.invalidEvalsSchema, strictness),
          skill,
          getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
          line,
          `Eval #${index + 1} is not an object.`,
        ),
      );
      continue;
    }

    const evalRecord = evalEntry as Record<string, unknown>;
    const id = evalRecord.id;
    const prompt = evalRecord.prompt;
    const expectedOutput = evalRecord.expected_output;
    const files = evalRecord.files;
    const expectations = evalRecord.expectations ?? evalRecord.assertions;

    if (!Number.isInteger(id)) {
      diagnostics.push(
        createDiagnostic(
          rules.invalidEvalsSchema,
          severityForRule(rules.invalidEvalsSchema, strictness),
          skill,
          getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
          line,
          `Eval #${index + 1} is missing an integer \`id\`.`,
        ),
      );
    } else {
      const evalId = id as number;
      if (seenIds.has(evalId)) {
        diagnostics.push(
          createDiagnostic(
            rules.duplicateEvalId,
            severityForRule(rules.duplicateEvalId, strictness),
            skill,
            getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
            line,
            `Eval id \`${evalId}\` is duplicated.`,
          ),
        );
      } else {
        seenIds.add(evalId);
      }
    }

    if (typeof prompt !== "string" || prompt.trim() === "") {
      diagnostics.push(
        createDiagnostic(
          rules.emptyEvalPrompt,
          severityForRule(rules.emptyEvalPrompt, strictness),
          skill,
          getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
          line,
          `Eval ${typeof id === "number" ? `\`${id}\`` : `#${index + 1}`} is missing a prompt.`,
        ),
      );
    }

    if (typeof expectedOutput !== "string" || expectedOutput.trim() === "") {
      diagnostics.push(
        createDiagnostic(
          rules.missingExpectedOutput,
          severityForRule(rules.missingExpectedOutput, strictness),
          skill,
          getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
          line,
          `Eval ${typeof id === "number" ? `\`${id}\`` : `#${index + 1}`} is missing \`expected_output\`.`,
        ),
      );
    }

    if (files !== undefined) {
      if (!Array.isArray(files) || !files.every((entry) => typeof entry === "string")) {
        diagnostics.push(
          createDiagnostic(
            rules.invalidEvalsSchema,
            severityForRule(rules.invalidEvalsSchema, strictness),
            skill,
            getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
            line,
            `Eval ${typeof id === "number" ? `\`${id}\`` : `#${index + 1}`} has a non-string \`files\` list.`,
          ),
        );
      } else {
        for (const filePath of files) {
          const resolvedPath = path.resolve(skill.rootDirectory, filePath);
          if (!fs.existsSync(resolvedPath)) {
            diagnostics.push(
              createDiagnostic(
                rules.missingEvalFile,
                severityForRule(rules.missingEvalFile, strictness),
                skill,
                getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
                line,
                `Eval ${typeof id === "number" ? `\`${id}\`` : `#${index + 1}`} references missing file \`${filePath}\`.`,
              ),
            );
          }
        }
      }
    }

    if (expectations !== undefined) {
      if (!Array.isArray(expectations) || !expectations.every((entry) => typeof entry === "string")) {
        diagnostics.push(
          createDiagnostic(
            rules.invalidEvalExpectations,
            severityForRule(rules.invalidEvalExpectations, strictness),
            skill,
            getRelativePath(skill.inventory.evalsPath, skill.rootDirectory),
            line,
            `Eval ${typeof id === "number" ? `\`${id}\`` : `#${index + 1}`} has non-string expectations/assertions.`,
          ),
        );
      }
    }
  }

  return diagnostics;
};

const addFrontmatterDiagnostics = (
  skill: SkillInfo,
  document: SkillDocument,
  strictness: Strictness,
  diagnostics: Diagnostic[],
) => {
  const relativeSkillFilePath = getRelativePath(document.skillFilePath, skill.rootDirectory);

  if (!document.frontmatter.present) {
    diagnostics.push(
      createDiagnostic(
        rules.missingFrontmatter,
        severityForRule(rules.missingFrontmatter, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
    return;
  }

  if (!document.frontmatter.valid) {
    for (const issue of document.frontmatter.issues) {
      diagnostics.push(
        createDiagnostic(
          rules.invalidFrontmatter,
          severityForRule(rules.invalidFrontmatter, strictness),
          skill,
          relativeSkillFilePath,
          issue.line,
          issue.message,
        ),
      );
    }
    return;
  }

  for (const key of Object.keys(document.frontmatter.data)) {
    if (!["name", "description", "compatibility", "allowed-tools", "license", "metadata"].includes(key)) {
      diagnostics.push(
        createDiagnostic(
          rules.unexpectedFrontmatterKey,
          severityForRule(rules.unexpectedFrontmatterKey, strictness),
          skill,
          relativeSkillFilePath,
          1,
          `Unexpected frontmatter key \`${key}\`.`,
        ),
      );
    }
  }

  const nameValue = document.frontmatter.data.name;
  if (typeof nameValue !== "string" || nameValue.trim() === "") {
    diagnostics.push(
      createDiagnostic(
        rules.missingFrontmatterName,
        severityForRule(rules.missingFrontmatterName, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
  } else if (!isKebabCase(nameValue.trim()) || nameValue.trim().length > 64) {
    diagnostics.push(
      createDiagnostic(
        rules.invalidFrontmatterName,
        severityForRule(rules.invalidFrontmatterName, strictness),
        skill,
        relativeSkillFilePath,
        1,
        "The `name` should be kebab-case and 64 characters or fewer.",
      ),
    );
  }

  const descriptionValue = document.frontmatter.data.description;
  if (typeof descriptionValue !== "string") {
    diagnostics.push(
      createDiagnostic(
        rules.missingFrontmatterDescription,
        severityForRule(rules.missingFrontmatterDescription, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
    return;
  }

  const description = descriptionValue.trim();
  if (description === "") {
    diagnostics.push(
      createDiagnostic(
        rules.missingFrontmatterDescription,
        severityForRule(rules.missingFrontmatterDescription, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
    return;
  }

  if (description.includes("<") || description.includes(">") || description.length > 1024) {
    diagnostics.push(
      createDiagnostic(
        rules.invalidFrontmatterDescription,
        severityForRule(rules.invalidFrontmatterDescription, strictness),
        skill,
        relativeSkillFilePath,
        1,
        "The description should be plain text without angle brackets and stay under 1024 characters.",
      ),
    );
  }

  if (description.length < 40) {
    diagnostics.push(
      createDiagnostic(
        rules.shortFrontmatterDescription,
        severityForRule(rules.shortFrontmatterDescription, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
  }

  if (strictness !== "default" && description.length > 900) {
    diagnostics.push(
      createDiagnostic(
        rules.longFrontmatterDescription,
        severityForRule(rules.longFrontmatterDescription, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
  }

  if (!TRIGGER_LANGUAGE_PATTERN.test(description)) {
    diagnostics.push(
      createDiagnostic(
        rules.descriptionMissingTriggerGuidance,
        severityForRule(rules.descriptionMissingTriggerGuidance, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
  }

  if (
    description.length < 120 &&
    GENERIC_DESCRIPTION_PATTERN.test(description) &&
    !TRIGGER_LANGUAGE_PATTERN.test(description)
  ) {
    diagnostics.push(
      createDiagnostic(
        rules.genericDescription,
        severityForRule(rules.genericDescription, strictness),
        skill,
        relativeSkillFilePath,
        1,
      ),
    );
  }
};

const addBodyDiagnostics = (
  skill: SkillInfo,
  document: SkillDocument,
  strictness: Strictness,
  diagnostics: Diagnostic[],
) => {
  const relativeSkillFilePath = getRelativePath(document.skillFilePath, skill.rootDirectory);
  const nonEmptyBodyLines = document.body.split("\n").filter((line) => NON_EMPTY_LINE_PATTERN.test(line));

  if (nonEmptyBodyLines.length < 8 || document.body.trim().length < 180) {
    diagnostics.push(
      createDiagnostic(
        rules.shortContent,
        severityForRule(rules.shortContent, strictness),
        skill,
        relativeSkillFilePath,
        document.bodyStartLine,
      ),
    );
  }

  const headingCounts = new Map<string, number>();
  for (const heading of document.headings) {
    const normalized = normalizeHeading(heading.text);
    if (!normalized) continue;
    headingCounts.set(normalized, (headingCounts.get(normalized) ?? 0) + 1);
  }

  for (const heading of document.headings) {
    const normalized = normalizeHeading(heading.text);
    if (!normalized) continue;
    if ((headingCounts.get(normalized) ?? 0) > 2) {
      diagnostics.push(
        createDiagnostic(
          rules.duplicateHeading,
          severityForRule(rules.duplicateHeading, strictness),
          skill,
          relativeSkillFilePath,
          heading.line,
          `Heading \`${heading.text}\` is duplicated.`,
        ),
      );
      headingCounts.set(normalized, 0);
    }
  }

  if (!USAGE_GUIDANCE_PATTERN.test(document.body)) {
    diagnostics.push(
      createDiagnostic(
        rules.missingUsageGuidance,
        severityForRule(rules.missingUsageGuidance, strictness),
        skill,
        relativeSkillFilePath,
        document.bodyStartLine,
      ),
    );
  }

  const disclosureDirectories = skill.inventory.resourceDirectories.filter(
    (directory) => directory === "references" || directory === "scripts",
  );
  if (document.lineCount > 700 && disclosureDirectories.length === 0) {
    diagnostics.push(
      createDiagnostic(
        rules.largeInlineSkill,
        severityForRule(rules.largeInlineSkill, strictness),
        skill,
        relativeSkillFilePath,
        document.bodyStartLine,
      ),
    );
  }
};

export const analyzeSkill = (rootDirectory: string, strictness: Strictness): SkillDiagnosisResult => {
  const skillFilePath = path.join(rootDirectory, "SKILL.md");
  const inventory = inspectSkillInventory(rootDirectory);
  const exists = fs.existsSync(skillFilePath);

  const placeholderName = path.basename(rootDirectory);
  const baseSkill: SkillInfo = {
    name: placeholderName,
    rootDirectory,
    skillFilePath,
    inventory,
  };

  if (!exists) {
    const diagnostics = [
      createDiagnostic(
        rules.missingSkillMd,
        severityForRule(rules.missingSkillMd, strictness),
        baseSkill,
        "SKILL.md",
        1,
      ),
    ];
    return {
      skill: baseSkill,
      diagnostics,
      score: calculateScore(diagnostics),
    };
  }

  const document = readSkillDocument(rootDirectory);
  const frontmatterName =
    typeof document.frontmatter.data.name === "string" ? document.frontmatter.data.name.trim() : null;
  const skill: SkillInfo = {
    ...baseSkill,
    name: frontmatterName && frontmatterName.length > 0 ? frontmatterName : placeholderName,
  };

  if (document.content.trim() === "") {
    const diagnostics = [
      createDiagnostic(
        rules.emptySkillMd,
        severityForRule(rules.emptySkillMd, strictness),
        skill,
        "SKILL.md",
        1,
      ),
    ];
    return {
      skill,
      diagnostics,
      score: calculateScore(diagnostics),
    };
  }

  const diagnostics: Diagnostic[] = [];
  addFrontmatterDiagnostics(skill, document, strictness, diagnostics);
  addBodyDiagnostics(skill, document, strictness, diagnostics);
  diagnostics.push(...collectReferenceDiagnostics(skill, document, strictness));
  diagnostics.push(...collectEvalsDiagnostics(skill, strictness));

  return {
    skill,
    diagnostics,
    score: calculateScore(diagnostics),
  };
};
