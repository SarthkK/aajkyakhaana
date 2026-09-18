/**
 * Helpers for schemas that satisfy strict structured-output mode.
 *
 * Strict mode constrains the decoder so the model physically cannot emit JSON that
 * breaks the schema. Best-effort mode only asks nicely, and smaller models do fail —
 * we saw a model emit the key `"nutrition_note**: "` and Groq reject whole responses
 * with "Failed to generate JSON".
 *
 * The price is three rules, which `strictObject` enforces for you:
 *   1. every property must appear in `required`
 *   2. `additionalProperties` must be false
 *   3. anything genuinely optional is expressed as a nullable union, not omission
 */

export type JsonSchema = Record<string, unknown>;

/** An object where every declared property is required and nothing else is allowed. */
export function strictObject(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** A field the model may genuinely not know. Required, but allowed to be null. */
export function nullable(type: string, description?: string): JsonSchema {
  return { type: [type, "null"], ...(description ? { description } : {}) };
}

export function str(description?: string): JsonSchema {
  return { type: "string", ...(description ? { description } : {}) };
}

export function bool(description?: string): JsonSchema {
  return { type: "boolean", ...(description ? { description } : {}) };
}

export function int(description?: string): JsonSchema {
  return { type: "integer", ...(description ? { description } : {}) };
}

export function enumOf(values: readonly string[], description?: string): JsonSchema {
  return { type: "string", enum: [...values], ...(description ? { description } : {}) };
}

export function arrayOf(items: JsonSchema, description?: string): JsonSchema {
  // Deliberately no minItems/maxItems: Groq rejects any schema carrying them.
  return { type: "array", items, ...(description ? { description } : {}) };
}
