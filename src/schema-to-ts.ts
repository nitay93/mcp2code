import type { JsonSchema } from "./types.ts";

export function schemaToType(schema: JsonSchema | undefined, fallback: string): string {
  if (!schema) return fallback;
  if (schema.$ref) return "unknown";
  if (schema.const !== undefined) return literal(schema.const);
  if (schema.enum) return schema.enum.map(literal).join(" | ") || "never";
  if (schema.oneOf) return schema.oneOf.map((item) => schemaToType(item, "unknown")).join(" | ");
  if (schema.anyOf) return schema.anyOf.map((item) => schemaToType(item, "unknown")).join(" | ");
  if (schema.allOf) return schema.allOf.map((item) => schemaToType(item, "unknown")).join(" & ");

  const type = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : inferTypes(schema);
  const rendered = type.map((item) => renderTypedSchema(item, schema));
  return [...new Set(rendered)].join(" | ") || fallback;
}

function renderTypedSchema(type: string, schema: JsonSchema): string {
  switch (type) {
    case "object":
      return objectType(schema);
    case "array":
      return arrayType(schema);
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      return "unknown";
  }
}

function inferTypes(schema: JsonSchema): string[] {
  if (schema.properties || schema.additionalProperties) return ["object"];
  if (schema.items) return ["array"];
  return ["unknown"];
}

function objectType(schema: JsonSchema): string {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(properties).map(([key, value]) => {
    const optional = required.has(key) ? "" : "?";
    return `${quoteProperty(key)}${optional}: ${schemaToType(value, "unknown")};`;
  });

  const additional = schema.additionalProperties;
  if (additional && typeof additional === "object") {
    entries.push(`[key: string]: ${schemaToType(additional, "unknown")};`);
  } else if (additional === true && entries.length === 0) {
    entries.push("[key: string]: unknown;");
  }

  if (entries.length === 0) return "Record<string, unknown>";
  return `{\n${entries.map((entry) => indent(entry)).join("\n")}\n}`;
}

function arrayType(schema: JsonSchema): string {
  if (Array.isArray(schema.items)) {
    return `[${schema.items.map((item) => schemaToType(item, "unknown")).join(", ")}]`;
  }
  return `Array<${schemaToType(schema.items, "unknown")}>`;
}

function literal(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return "unknown";
}

function quoteProperty(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function indent(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
