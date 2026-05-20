#!/usr/bin/env node
import { resolve } from "node:path";
import { compileMcpToSkill } from "./compiler.ts";

type CliArgs = {
  command?: string;
  config?: string;
  out: string;
  skillName: string;
  help: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command !== "compile") {
    printHelp();
    process.exit(args.command === "compile" || args.help ? 0 : 1);
  }
  const result = await compileMcpToSkill({
    configPath: args.config,
    outDir: resolve(args.out),
    skillName: args.skillName
  });
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  console.log(`Generated ${result.toolCount} tool functions from ${result.serverCount} MCP servers at ${result.skillDir}`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: argv[0],
    out: ".agents/skills",
    skillName: "mcp-tools",
    help: false
  };
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--config") args.config = requiredValue(argv, ++index, "--config");
    else if (arg === "--out") args.out = requiredValue(argv, ++index, "--out");
    else if (arg === "--skill-name") args.skillName = requiredValue(argv, ++index, "--skill-name");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp(): void {
  console.log(`Usage:
  mcp2skill compile [--config <path>] [--out .agents/skills] [--skill-name mcp-tools]

Reads Codex MCP config.toml, introspects enabled MCP servers, and emits a local Codex skill package.
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
