import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileMcpToSkill } from "../src/compiler.ts";

test("compiles and calls an HTTP MCP with bearer and static headers", async () => {
  const originalFetch = globalThis.fetch;
  const seenHeaders: string[] = [];
  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    seenHeaders.push(`${headers.get("authorization") ?? ""}|${headers.get("x-test-region") ?? ""}`);
    const rpc = JSON.parse(String(init?.body));
    const result =
      rpc.method === "tools/list"
        ? {
            tools: [
              {
                name: "sum_values",
                inputSchema: {
                  type: "object",
                  properties: { values: { type: "array", items: { type: "number" } } },
                  required: ["values"]
                },
                outputSchema: { type: "number" }
              }
            ]
          }
        : rpc.method === "tools/call"
          ? rpc.params.arguments.values.reduce((sum: number, value: number) => sum + value, 0)
          : {};
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const dir = mkdtempSync(join(tmpdir(), "mcp2code-http-"));
    const configPath = join(dir, "config.toml");
    process.env.MCP2CODE_TEST_TOKEN = "secret-token";
    writeFileSync(
      configPath,
      `
[mcp_servers.http_fixture]
url = "https://example.invalid/mcp"
bearer_token_env_var = "MCP2CODE_TEST_TOKEN"
http_headers = { "X-Test-Region" = "local" }
`,
      "utf8"
    );

    const result = await compileMcpToSkill({ configPath, outDir: join(dir, "skills"), skillName: "http-tools" });
    assert.equal(result.toolCount, 1);
    const mod = await import(pathToFileURL(join(result.skillDir, "scripts/generated/http_fixture/functions.ts")).href);
    assert.equal(await mod.sumValues({ values: [1, 2, 3] }), 6);
    assert.ok(seenHeaders.every((item) => item === "Bearer secret-token|local"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
