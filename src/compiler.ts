import { readCodexMcpConfig, resolveConfigPath } from "./config.ts";
import { generateSkillPackage } from "./generate.ts";
import { introspectConfig } from "./introspect.ts";
import type { CompileOptions } from "./types.ts";

export async function compileMcpToSkill(options: CompileOptions): Promise<{
  skillDir: string;
  warnings: string[];
  serverCount: number;
  toolCount: number;
}> {
  const configPath = resolveConfigPath(options.configPath);
  const config = readCodexMcpConfig(configPath);
  const { mcps, warnings } = await introspectConfig(config);
  const skillDir = generateSkillPackage({
    mcps,
    outDir: options.outDir,
    skillName: options.skillName,
    warnings
  });
  return {
    skillDir,
    warnings: warnings.map((warning) => {
      const prefix = [warning.serverId, warning.toolName].filter(Boolean).join("/");
      return prefix ? `${prefix}: ${warning.message}` : warning.message;
    }),
    serverCount: mcps.length,
    toolCount: mcps.reduce((sum, mcp) => sum + mcp.tools.length, 0)
  };
}
