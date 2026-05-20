import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexMcpConfig } from "../src/config.ts";
import { filterTools } from "../src/introspect.ts";

test("parses Codex MCP config tables and auth fields", () => {
  const config = parseCodexMcpConfig(`
mcp_oauth_credentials_store = "file"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
env_vars = ["LOCAL_TOKEN", { name = "REMOTE_TOKEN", source = "remote" }]
enabled_tools = ["resolve-library-id"]
disabled_tools = ["danger"]
startup_timeout_sec = 3

[mcp_servers.context7.env]
TOKEN = "abc"

[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_TOKEN"
http_headers = { "X-Region" = "us" }
enabled = false
`);

  assert.equal(config.mcp_oauth_credentials_store, "file");
  assert.equal(config.mcp_servers.context7.command, "npx");
  assert.deepEqual(config.mcp_servers.context7.args, ["-y", "@upstash/context7-mcp"]);
  assert.deepEqual(config.mcp_servers.context7.env, { TOKEN: "abc" });
  assert.deepEqual(config.mcp_servers.context7.env_vars, ["LOCAL_TOKEN", { name: "REMOTE_TOKEN", source: "remote" }]);
  assert.equal(config.mcp_servers.figma.enabled, false);
  assert.equal(config.mcp_servers.figma.bearer_token_env_var, "FIGMA_TOKEN");
});

test("filters tools with allow list before deny list", () => {
  const tools = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(filterTools(tools, ["a", "b"], ["b"]).map((tool) => tool.name), ["a"]);
});
