# mcp2code

Compile your [Codex](https://developers.openai.com/codex) MCP configuration into a local **skill** with typed TypeScript wrappers for every tool.

Instead of invoking MCP tools ad hoc from agent prompts, `mcp2code` introspects your configured servers, maps JSON Schemas to TypeScript types, and emits async functions you can import and call from scripts or skills.

## Why

**Problem:** When agents call MCP tools directly, every invocation and response tends to flow through the conversation. That makes multi-step workflows chatty, hard to reuse, and expensive in tokens.

**Approach:** `mcp2code` compiles your existing MCP servers into typed TypeScript functions inside a Codex skill. Agents call tools *as code*—compose logic, branch, and batch work in scripts instead of chaining one-off tool calls in the prompt.

**Payoff:** Complex, interdependent workflows become reusable scripts with fewer intermediate steps and less tool output cluttering the agent's context.

Other projects explore similar directions; this one focuses on a small compile step from MCP config → skill package, with the goal of staying portable to other agent harnesses over time.

## How it works

1. **Read** `config.toml` from `.codex/config.toml` (project) or `~/.codex/config.toml` (user).
2. **Connect** to each enabled MCP server (stdio or HTTP) and list tools.
3. **Generate** a skill package under `.agents/skills/<skill-name>/` with:
   - `SKILL.md` — skill metadata and usage notes for Codex
   - `scripts/generated/<server-id>/types.ts` — input/output types per tool
   - `scripts/generated/<server-id>/functions.ts` — typed `async` wrappers
   - `scripts/runtime/mcp-adapter.ts` — shared runtime that talks to MCP servers
   - `scripts/runtime/manifest.json` — server connection details used at runtime

```mermaid
flowchart LR
  config[".codex/config.toml"] --> compile["mcp2code compile"]
  compile --> introspect["Introspect MCP servers"]
  introspect --> generate["Generate skill package"]
  generate --> skill[".agents/skills/mcp-tools/"]
  skill --> call["import { toolFn } from functions.ts"]
  call --> mcp["MCP server"]
```

## Requirements

- **Node.js** ≥ 22.6.0
- A Codex MCP config with at least one enabled server that defines either `command` (stdio) or `url` (HTTP)

## Install

From source:

```bash
git clone https://github.com/nitay93/mcp2code.git
cd mcp2code
pnpm install
pnpm build
```

Link the CLI globally (optional):

```bash
pnpm link --global
```

Or run without linking:

```bash
pnpm compile
# equivalent to: node ./src/cli.ts compile
```

## Usage

```bash
mcp2code compile [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--config <path>` | `.codex/config.toml`, then `~/.codex/config.toml` | Path to Codex MCP config |
| `--out <dir>` | `.agents/skills` | Output directory for generated skills |
| `--skill-name <name>` | `mcp-tools` | Skill folder name under `--out` |
| `-h`, `--help` | — | Show help |

Example with a project-local config:

```bash
mcp2code compile --config .codex/config.toml --out .agents/skills --skill-name mcp-tools
```

On success, the CLI prints how many tool functions were generated and where the skill lives. Warnings (skipped servers, missing schemas) go to stderr.

### Example config

```toml
[mcp_servers.my-server]
command = "npx"
args = ["-y", "some-mcp-package"]
enabled_tools = ["search", "fetch"]   # optional: allowlist
# disabled_tools = ["dangerous"]      # optional: blocklist
```

HTTP servers are supported when `url` is set, along with `bearer_token_env_var`, `http_headers`, and `env_http_headers` as in Codex config.

### Calling generated tools

After compile, import from the generated module:

```typescript
import { search } from "./.agents/skills/mcp-tools/scripts/generated/my-server/functions.ts";

const result = await search({ query: "typescript mcp" });
```

Each function accepts an optional second argument for timeouts and env overrides:

```typescript
await search({ query: "..." }, { timeoutMs: 30_000, env: { DEBUG: "1" } });
```

Types live alongside in `types.ts` (e.g. `SearchInput`, `SearchOutput`).

## Supported MCP features

| Feature | Compile-time introspection | Runtime calls |
|---------|---------------------------|---------------|
| Stdio (`command` + `args`) | Yes | Yes |
| HTTP (`url`) | Yes | Yes |
| Bearer token via env var | Yes | Yes |
| Static / env HTTP headers | Yes | Yes |
| `env_vars` forwarding | Yes | Yes |
| `enabled_tools` / `disabled_tools` | Yes | — |
| OAuth credential reuse | No | No |

Servers marked `required = true` that fail to connect will abort the compile. Non-required servers are skipped with a warning.

Tools without `inputSchema` or `outputSchema` still get wrappers; types fall back to `Record<string, unknown>` and `unknown` respectively.

## Generated layout

```
.agents/skills/mcp-tools/
├── SKILL.md
├── package.json
└── scripts/
    ├── runtime/
    │   ├── mcp-adapter.ts
    │   └── manifest.json
    └── generated/
        └── <server-id>/
            ├── types.ts
            └── functions.ts
```

Do not edit generated files by hand; re-run `mcp2code compile` after changing MCP config or server tool definitions.

## Development

```bash
pnpm install
pnpm build          # bundle CLI to dist/
pnpm test           # node --test
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm dev            # tsup --watch
```

## License

MIT — see [LICENSE](LICENSE).
