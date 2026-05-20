import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { CodexMcpConfig, CodexMcpServerConfig } from "./types.ts";

type TomlPrimitive = string | number | boolean;
type TomlValue = TomlPrimitive | TomlArray | TomlTable;
interface TomlArray extends Array<TomlValue> {}
interface TomlTable {
  [key: string]: TomlValue;
}

export function resolveConfigPath(explicitPath?: string): string {
  if (explicitPath) return resolve(explicitPath);
  const projectPath = resolve(process.cwd(), ".codex", "config.toml");
  if (existsSync(projectPath)) return projectPath;
  return resolve(homedir(), ".codex", "config.toml");
}

export function readCodexMcpConfig(configPath: string): CodexMcpConfig {
  const text = readFileSync(configPath, "utf8");
  return parseCodexMcpConfig(text);
}

export function parseCodexMcpConfig(text: string): CodexMcpConfig {
  const root: Record<string, TomlValue> = {};
  let current: Record<string, TomlValue> = root;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      current = ensureTable(root, splitDottedPath(table[1].trim()));
      continue;
    }
    const separator = findTopLevelEquals(line);
    if (separator === -1) {
      throw new Error(`Invalid TOML line: ${rawLine}`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    setPathValue(current, splitDottedPath(key), parseTomlValue(value));
  }

  const rawServers = asRecord(root.mcp_servers);
  const servers: Record<string, CodexMcpServerConfig> = {};
  for (const [id, rawServer] of Object.entries(rawServers)) {
    const server = asRecord(rawServer);
    servers[id] = normalizeServer(id, server);
  }

  return {
    mcp_oauth_callback_port: asOptionalNumber(root.mcp_oauth_callback_port),
    mcp_oauth_callback_url: asOptionalString(root.mcp_oauth_callback_url),
    mcp_oauth_credentials_store: asOauthStore(root.mcp_oauth_credentials_store),
    mcp_servers: servers
  };
}

function normalizeServer(id: string, raw: Record<string, TomlValue>): CodexMcpServerConfig {
  return {
    id,
    enabled: raw.enabled === undefined ? true : asBoolean(raw.enabled, `mcp_servers.${id}.enabled`),
    command: asOptionalString(raw.command),
    args: asOptionalStringArray(raw.args),
    cwd: asOptionalString(raw.cwd),
    env: asOptionalStringMap(raw.env),
    env_vars: asEnvVars(raw.env_vars),
    url: asOptionalString(raw.url),
    bearer_token_env_var: asOptionalString(raw.bearer_token_env_var),
    http_headers: asOptionalStringMap(raw.http_headers),
    env_http_headers: asOptionalStringMap(raw.env_http_headers),
    enabled_tools: asOptionalStringArray(raw.enabled_tools),
    disabled_tools: asOptionalStringArray(raw.disabled_tools),
    required: asOptionalBoolean(raw.required),
    startup_timeout_sec: asOptionalNumber(raw.startup_timeout_sec),
    startup_timeout_ms: asOptionalNumber(raw.startup_timeout_ms),
    tool_timeout_sec: asOptionalNumber(raw.tool_timeout_sec),
    default_tools_approval_mode: asApprovalMode(raw.default_tools_approval_mode)
  };
}

function stripComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const prev = line[index - 1];
    if ((char === `"` || char === "'") && prev !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    }
    if (char === "#" && quote === undefined) return line.slice(0, index);
  }
  return line;
}

function splitDottedPath(path: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const char of path) {
    if (char === `"` || char === "'") {
      quote = quote === char ? undefined : quote ?? char;
      continue;
    }
    if (char === "." && quote === undefined) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function ensureTable(root: Record<string, TomlValue>, path: string[]): Record<string, TomlValue> {
  let cursor = root;
  for (const segment of path) {
    const existing = cursor[segment];
    if (existing === undefined) cursor[segment] = {};
    if (!isRecord(cursor[segment])) throw new Error(`TOML path ${path.join(".")} is not a table`);
    cursor = cursor[segment] as Record<string, TomlValue>;
  }
  return cursor;
}

function setPathValue(root: Record<string, TomlValue>, path: string[], value: TomlValue): void {
  const key = path[path.length - 1];
  const parent = ensureTable(root, path.slice(0, -1));
  parent[key] = value;
}

function findTopLevelEquals(line: string): number {
  let quote: string | undefined;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const prev = line[index - 1];
    if ((char === `"` || char === "'") && prev !== "\\") quote = quote === char ? undefined : quote ?? char;
    if (quote === undefined) {
      if (char === "[") bracketDepth++;
      if (char === "]") bracketDepth--;
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
      if (char === "=" && bracketDepth === 0 && braceDepth === 0) return index;
    }
  }
  return -1;
}

function parseTomlValue(value: string): TomlValue {
  if (value.startsWith(`"`) || value.startsWith("'")) return parseString(value);
  if (value.startsWith("[")) return splitTopLevel(value.slice(1, -1)).filter(Boolean).map(parseTomlValue);
  if (value.startsWith("{")) return parseInlineTable(value);
  if (value === "true") return true;
  if (value === "false") return false;
  const numberValue = Number(value.replace(/_/g, ""));
  if (!Number.isNaN(numberValue)) return numberValue;
  throw new Error(`Unsupported TOML value: ${value}`);
}

function parseString(value: string): string {
  if (value.startsWith("'")) return value.slice(1, value.lastIndexOf("'"));
  return JSON.parse(value);
}

function parseInlineTable(value: string): Record<string, TomlValue> {
  const body = value.slice(1, -1).trim();
  const result: Record<string, TomlValue> = {};
  for (const pair of splitTopLevel(body)) {
    if (!pair.trim()) continue;
    const separator = findTopLevelEquals(pair);
    if (separator === -1) throw new Error(`Invalid inline table item: ${pair}`);
    const key = pair.slice(0, separator).trim().replace(/^["']|["']$/g, "");
    result[key] = parseTomlValue(pair.slice(separator + 1).trim());
  }
  return result;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    const prev = value[index - 1];
    if ((char === `"` || char === "'") && prev !== "\\") quote = quote === char ? undefined : quote ?? char;
    if (quote === undefined) {
      if (char === "[") bracketDepth++;
      if (char === "]") bracketDepth--;
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
      if (char === "," && bracketDepth === 0 && braceDepth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isRecord(value: unknown): value is Record<string, TomlValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, TomlValue> {
  return isRecord(value) ? value : {};
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function asOptionalStringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}

function asEnvVars(value: unknown): CodexMcpServerConfig["env_vars"] {
  if (!Array.isArray(value)) return undefined;
  const result: NonNullable<CodexMcpServerConfig["env_vars"]> = [];
  for (const item of value) {
    if (typeof item === "string") {
      result.push(item);
      continue;
    }
    if (isRecord(item) && typeof item.name === "string") {
      result.push({ name: item.name, source: item.source === "remote" ? "remote" : "local" });
    }
  }
  return result;
}

function asApprovalMode(value: unknown): CodexMcpServerConfig["default_tools_approval_mode"] {
  return value === "auto" || value === "prompt" || value === "approve" ? value : undefined;
}

function asOauthStore(value: unknown): CodexMcpConfig["mcp_oauth_credentials_store"] {
  return value === "auto" || value === "file" || value === "keyring" ? value : undefined;
}
