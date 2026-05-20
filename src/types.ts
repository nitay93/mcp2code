export type ApprovalMode = "auto" | "prompt" | "approve";

export type EnvVarForward =
  | string
  | {
      name: string;
      source?: "local" | "remote";
    };

export type CodexMcpServerConfig = {
  id: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  env_vars?: EnvVarForward[];
  url?: string;
  bearer_token_env_var?: string;
  http_headers?: Record<string, string>;
  env_http_headers?: Record<string, string>;
  enabled_tools?: string[];
  disabled_tools?: string[];
  required?: boolean;
  startup_timeout_sec?: number;
  startup_timeout_ms?: number;
  tool_timeout_sec?: number;
  default_tools_approval_mode?: ApprovalMode;
};

export type CodexMcpConfig = {
  mcp_oauth_callback_port?: number;
  mcp_oauth_callback_url?: string;
  mcp_oauth_credentials_store?: "auto" | "file" | "keyring";
  mcp_servers: Record<string, CodexMcpServerConfig>;
};

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  description?: string;
  title?: string;
  $ref?: string;
  [key: string]: unknown;
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
};

export type IntrospectedMcp = {
  server: CodexMcpServerConfig;
  tools: McpTool[];
};

export type CompileOptions = {
  configPath?: string;
  outDir: string;
  skillName: string;
};

export type CompileWarning = {
  serverId?: string;
  toolName?: string;
  message: string;
};
