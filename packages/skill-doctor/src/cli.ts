import path from "node:path";
import { Command, Option } from "commander";
import { printTextReport } from "./render.js";
import { diagnose } from "./scan.js";

const VERSION = process.env.VERSION ?? "0.0.0";

interface CliFlags {
  failOn: "error" | "warning" | "none";
  format: "text" | "json";
  score: boolean;
  strictness: "default" | "strict" | "pedantic";
  verbose: boolean;
}

const program = new Command()
  .name("skill-doctor")
  .description("Diagnose static quality issues in agent skills")
  .version(VERSION, "-v, --version", "display the version number")
  .argument("[directory]", "skill directory or workspace to scan", ".")
  .addOption(new Option("--format <format>", "output format: text or json").choices(["text", "json"]).default("text"))
  .addOption(
    new Option("--fail-on <level>", "exit with error code on diagnostics: error, warning, none")
      .choices(["error", "warning", "none"])
      .default("none"),
  )
  .addOption(
    new Option("--strictness <level>", "analysis strictness: default, strict, pedantic")
      .choices(["default", "strict", "pedantic"])
      .default("default"),
  )
  .option("--verbose", "show file details per rule")
  .option("--score", "output only the score")
  .action(async (directory: string, flags: CliFlags) => {
    const resolvedDirectory = path.resolve(directory);
    const result = await diagnose(resolvedDirectory, { strictness: flags.strictness });
    const shouldFail =
      flags.failOn === "warning"
        ? result.diagnostics.length > 0
        : flags.failOn === "error"
          ? result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
          : false;

    if (flags.score) {
      console.log(result.score.score);
      if (shouldFail) {
        process.exitCode = 1;
      }
      return;
    }

    if (flags.format === "json") {
      console.log(JSON.stringify(result, null, 2));
      if (shouldFail) {
        process.exitCode = 1;
      }
      return;
    }

    printTextReport(result, flags);
    if (shouldFail) {
      process.exitCode = 1;
    }
  });

void program.parseAsync(process.argv);
