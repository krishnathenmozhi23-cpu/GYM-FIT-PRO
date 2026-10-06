import { z } from "zod";

// Keywords that structured outputs may not support. Ranges and lengths are
// still enforced afterwards by the Zod validation layer.
const STRIP = new Set([
  "$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength",
  "minItems", "maxItems", "pattern", "format", "default",
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (STRIP.has(k)) continue;
    out[k === "oneOf" ? "anyOf" : k] = clean(v);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

/** JSON Schema for a Zod output type, simplified for structured outputs. */
export function toOutputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" })) as Record<string, unknown>;
}
