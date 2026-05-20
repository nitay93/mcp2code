const RESERVED = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);

export function toIdentifier(value: string, fallback = "value"): string {
  const parts = value
    .replace(/['"]/g, "")
    .split(/[^A-Za-z0-9$]+|_+/)
    .filter(Boolean);
  const joined = parts
    .map((part, index) => {
      const normalized = part.replace(/^[^A-Za-z_$]+/, "");
      if (!normalized) return "";
      if (index === 0) return normalized.charAt(0).toLowerCase() + normalized.slice(1);
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
  let candidate = joined || fallback;
  if (!/^[A-Za-z_$]/.test(candidate)) candidate = `${fallback}${candidate}`;
  if (RESERVED.has(candidate)) candidate = `${candidate}Value`;
  return candidate;
}

export function toTypeName(value: string, suffix = ""): string {
  const id = toIdentifier(value, "Generated");
  return `${id.charAt(0).toUpperCase()}${id.slice(1)}${suffix}`;
}

export function toSafeDirName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "mcp";
}

export function uniqueNames(values: string[]): Map<string, string> {
  const used = new Map<string, number>();
  const result = new Map<string, string>();
  for (const value of values) {
    const base = toIdentifier(value, "tool");
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    result.set(value, count === 0 ? base : `${base}${count + 1}`);
  }
  return result;
}
