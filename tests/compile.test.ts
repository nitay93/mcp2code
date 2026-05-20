import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileMcpToSkill } from "../src/compiler.ts";

test("compiles a stdio MCP into a skill and calls a generated function", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp2skill-"));
  const configPath = join(dir, "config.toml");
  const fixture = resolve("tests/fixtures/stdio-mcp.cjs");
  writeFileSync(
    configPath,
    `
[mcp_servers.fixture]
command = "node"
args = ["${fixture}"]
enabled_tools = ["echo_message"]
`,
    "utf8"
  );

  const result = await compileMcpToSkill({ configPath, outDir: join(dir, "skills"), skillName: "mcp-tools" });
  assert.equal(result.serverCount, 1);
  assert.equal(result.toolCount, 1);

  const types = readFileSync(join(result.skillDir, "scripts/generated/fixture/types.ts"), "utf8");
  const functions = readFileSync(join(result.skillDir, "scripts/generated/fixture/functions.ts"), "utf8");
  assert.match(types, /export type EchoMessageInput/);
  assert.match(types, /message: string/);
  assert.match(functions, /export async function echoMessage/);

  execFileSync(
    "node",
    [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--allowImportingTsExtensions",
      join(result.skillDir, "scripts/generated/fixture/functions.ts")
    ],
    { cwd: resolve("."), stdio: "pipe" }
  );

  const mod = await import(pathToFileURL(join(result.skillDir, "scripts/generated/fixture/functions.ts")).href);
  const response = await mod.echoMessage({ message: "hello" });
  assert.deepEqual(response, { echoed: "hello" });
});
