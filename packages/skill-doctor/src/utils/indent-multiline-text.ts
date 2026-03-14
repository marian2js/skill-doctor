export const indentMultilineText = (text: string, indent: string): string =>
  text
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
