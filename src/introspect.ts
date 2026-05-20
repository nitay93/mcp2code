import { connectMcpServer } from "./mcp/client.ts";
import type { CodexMcpConfig, CompileWarning, IntrospectedMcp, McpTool } from "./types.ts";

export async function introspectConfig(config: CodexMcpConfig): Promise<{
  mcps: IntrospectedMcp[];
  warnings: CompileWarning[];
}> {
  const mcps: IntrospectedMcp[] = [];
  const warnings: CompileWarning[] = [];

  for (const server of Object.values(config.mcp_servers)) {
    if (!server.enabled) continue;
    try {
      const client = await connectMcpServer(server);
      try {
        const listedTools = await client.listTools();
        const tools = filterTools(listedTools, server.enabled_tools, server.disabled_tools);
        for (const tool of tools) {
          if (!tool.inputSchema) warnings.push({ serverId: server.id, toolName: tool.name, message: "Tool has no input schema; using Record<string, unknown>." });
          if (!tool.outputSchema) warnings.push({ serverId: server.id, toolName: tool.name, message: "Tool has no output schema; using unknown." });
        }
        mcps.push({ server, tools });
      } finally {
        await client.close();
      }
    } catch (error) {
      if (server.required) throw error;
      warnings.push({
        serverId: server.id,
        message: `Skipping MCP server "${server.id}": ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  return { mcps, warnings };
}

export function filterTools(tools: McpTool[], enabled?: string[], disabled?: string[]): McpTool[] {
  const enabledSet = enabled ? new Set(enabled) : undefined;
  const disabledSet = new Set(disabled ?? []);
  return tools.filter((tool) => {
    if (enabledSet && !enabledSet.has(tool.name)) return false;
    return !disabledSet.has(tool.name);
  });
}
