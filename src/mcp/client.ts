import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { CodexMcpServerConfig, McpTool } from "../types.ts";

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type McpClient = {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown, timeoutMs?: number): Promise<unknown>;
  close(): Promise<void>;
};

export async function connectMcpServer(server: CodexMcpServerConfig): Promise<McpClient> {
  if (server.command) {
    const client = new StdioMcpClient(server);
    await client.initialize();
    return client;
  }
  if (server.url) {
    const client = new HttpMcpClient(server);
    await client.initialize();
    return client;
  }
  throw new Error(`MCP server "${server.id}" must define either command or url`);
}

class StdioMcpClient implements McpClient {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly server: CodexMcpServerConfig;

  constructor(server: CodexMcpServerConfig) {
    this.server = server;
  }

  async initialize(): Promise<void> {
    const env = { ...process.env, ...this.server.env };
    for (const forwarded of this.server.env_vars ?? []) {
      const name = typeof forwarded === "string" ? forwarded : forwarded.name;
      if (process.env[name] !== undefined) env[name] = process.env[name];
    }
    this.child = spawn(this.server.command!, this.server.args ?? [], {
      cwd: this.server.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child.once("exit", (code, signal) => {
      const error = new Error(`MCP server "${this.server.id}" exited (${code ?? signal})`);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
    this.child.stderr.on("data", () => undefined);
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp2code", version: "0.1.0" }
    });
    this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request("tools/list", {});
    return normalizeToolsResult(result);
  }

  async callTool(name: string, args: unknown, timeoutMs?: number): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args ?? {} }, timeoutMs);
  }

  async close(): Promise<void> {
    this.child?.kill();
  }

  private request(method: string, params: unknown, timeoutMs = 60_000): Promise<unknown> {
    const child = this.child;
    if (!child) throw new Error("MCP stdio client is not initialized");
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      child.stdin.write(`${payload}\n`);
    });
  }

  private notify(method: string, params: unknown): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
}

class HttpMcpClient implements McpClient {
  private readonly server: CodexMcpServerConfig;

  constructor(server: CodexMcpServerConfig) {
    this.server = server;
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp2code", version: "0.1.0" }
    });
    await this.request("notifications/initialized", {});
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request("tools/list", {});
    return normalizeToolsResult(result);
  }

  async callTool(name: string, args: unknown, timeoutMs?: number): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args ?? {} }, timeoutMs);
  }

  async close(): Promise<void> {
    return undefined;
  }

  private async request(method: string, params: unknown, timeoutMs = 60_000): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.server.url!, {
        method: "POST",
        signal: controller.signal,
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      if (!response.ok) throw new Error(`HTTP MCP request failed with ${response.status}`);
      const message = (await response.json()) as JsonRpcResponse;
      if (message.error) throw new Error(message.error.message);
      return message.result;
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...this.server.http_headers
    };
    for (const [header, envName] of Object.entries(this.server.env_http_headers ?? {})) {
      const value = process.env[envName];
      if (value !== undefined) headers[header] = value;
    }
    if (this.server.bearer_token_env_var) {
      const token = process.env[this.server.bearer_token_env_var];
      if (token) headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }
}

function normalizeToolsResult(result: unknown): McpTool[] {
  if (!result || typeof result !== "object") return [];
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const item = tool as McpTool;
    return typeof item.name === "string" ? [item] : [];
  });
}
