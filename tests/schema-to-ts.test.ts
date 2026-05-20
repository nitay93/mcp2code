import test from "node:test";
import assert from "node:assert/strict";
import { schemaToType } from "../src/schema-to-ts.ts";

test("generates object types with required and optional fields", () => {
  const type = schemaToType(
    {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
        tags: { type: "array", items: { enum: ["a", "b"] } },
        nested: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"]
        }
      },
      required: ["name"]
    },
    "unknown"
  );
  assert.match(type, /name: string/);
  assert.match(type, /count\?: number/);
  assert.match(type, /tags\?: Array<"a" \| "b">/);
  assert.match(type, /enabled: boolean/);
});

test("uses explicit fallbacks for missing schemas", () => {
  assert.equal(schemaToType(undefined, "Record<string, unknown>"), "Record<string, unknown>");
  assert.equal(schemaToType(undefined, "unknown"), "unknown");
});
