import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import type {
  FrontmatterData,
  FrontmatterIssue,
  Heading,
  ResourceReference,
  SkillDocument,
} from "../types.js";

const CODE_SPAN_PATTERN = /`([^`\n]+)`/g;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*]\(([^)]+)\)/g;
const PLAIN_PATH_PATTERN =
  /(?:^|[\s"(])((?:agents|assets|references|scripts)\/[A-Za-z0-9._@/-]+[A-Za-z0-9_@/-])/g;

const normalizeContent = (content: string): string => content.replace(/\r\n?/g, "\n");

const parseFrontmatter = (content: string): {
  body: string;
  bodyStartLine: number;
  frontmatter: FrontmatterData;
} => {
  const lines = content.split("\n");
  const frontmatter: FrontmatterData = {
    present: false,
    valid: false,
    startLine: 1,
    endLine: 0,
    data: {},
    issues: [],
  };

  if (lines[0] !== "---") {
    return {
      body: content,
      bodyStartLine: 1,
      frontmatter,
    };
  }

  frontmatter.present = true;
  let closingIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index] === "---" || lines[index] === "...") {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    frontmatter.issues.push({
      message: "frontmatter block is not closed",
      line: 1,
    });
    return {
      body: content,
      bodyStartLine: 1,
      frontmatter,
    };
  }

  frontmatter.endLine = closingIndex + 1;
  const rawFrontmatter = lines.slice(1, closingIndex).join("\n");
  const document = parseDocument(rawFrontmatter, { prettyErrors: false });
  const issues: FrontmatterIssue[] = [];

  for (const issue of document.errors) {
    const line = issue.linePos?.[0]?.line ?? 1;
    issues.push({
      message: issue.message,
      line,
    });
  }

  const parsedValue = document.toJS();
  if (issues.length === 0 && parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
    frontmatter.valid = true;
    frontmatter.data = parsedValue as Record<string, unknown>;
  } else if (issues.length === 0) {
    issues.push({
      message: "frontmatter must parse to an object",
      line: 1,
    });
  }

  frontmatter.issues = issues;

  return {
    body: lines.slice(closingIndex + 1).join("\n"),
    bodyStartLine: closingIndex + 2,
    frontmatter,
  };
};

const collectDocumentSignals = (
  body: string,
  bodyStartLine: number,
): Pick<SkillDocument, "codeFenceCount" | "headings" | "resourceReferences"> => {
  const headings: Heading[] = [];
  const resourceReferences: ResourceReference[] = [];
  const lines = body.split("\n");

  let insideFence = false;
  let codeFenceCount = 0;

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = bodyStartLine + index;
    const line = rawLine.trim();

    if (/^(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      codeFenceCount += 1;
      continue;
    }

    if (!insideFence) {
      const headingMatch = rawLine.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch) {
        headings.push({
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
          line: lineNumber,
        });
      }

      for (const match of rawLine.matchAll(MARKDOWN_LINK_PATTERN)) {
        resourceReferences.push({
          destination: match[1],
          line: lineNumber,
          source: "link",
        });
      }

      for (const match of rawLine.matchAll(PLAIN_PATH_PATTERN)) {
        const destination = match[1].replace(/[.,:;]+$/, "");
        resourceReferences.push({
          destination,
          line: lineNumber,
          source: "plain-path",
        });
      }
    }

    for (const match of rawLine.matchAll(CODE_SPAN_PATTERN)) {
      const codeSpan = match[1];
      if (/^(agents|assets|references|scripts)\//.test(codeSpan)) {
        resourceReferences.push({
          destination: codeSpan,
          line: lineNumber,
          source: "code-span",
        });
      }
    }
  }

  return {
    codeFenceCount,
    headings,
    resourceReferences,
  };
};

export const readSkillDocument = (skillRoot: string): SkillDocument => {
  const skillFilePath = path.join(skillRoot, "SKILL.md");
  const rawContent = fs.readFileSync(skillFilePath, "utf8");
  const content = normalizeContent(rawContent);
  const { body, bodyStartLine, frontmatter } = parseFrontmatter(content);
  const signals = collectDocumentSignals(body, bodyStartLine);

  return {
    rootDirectory: skillRoot,
    skillFilePath,
    content,
    body,
    bodyStartLine,
    headings: signals.headings,
    resourceReferences: signals.resourceReferences,
    codeFenceCount: signals.codeFenceCount,
    lineCount: content.split("\n").length,
    byteSize: Buffer.byteLength(content),
    frontmatter,
  };
};
