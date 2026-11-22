import type { PromptProperty } from "./types.ts";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const TEXT_VALUE_MAX = 500;

export function propertyText(property: PromptProperty): string {
  if (Array.isArray(property.value)) {
    return property.value.map((item) => item.trim()).filter(Boolean).join(", ");
  }
  return (property.value ?? "").trim();
}

/**
 * Fills {{key}} placeholders with property values. A line whose placeholder has no
 * value is dropped, so optional settings simply disappear from the final prompt.
 */
export function renderPromptBody(body: string, properties: readonly PromptProperty[]): string {
  const values = new Map(properties.map((property) => [property.key, propertyText(property)]));
  const lines: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    let missing = false;
    const filled = line.replace(PLACEHOLDER, (_match, key: string) => {
      const value = values.get(key);
      if (!value) {
        missing = true;
        return "";
      }
      return value;
    });
    if (!missing) lines.push(filled);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function placeholderKeys(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(PLACEHOLDER), (match) => match[1]))];
}

/**
 * Applies user-chosen values to property definitions, keeping only valid choices.
 * Unknown keys are ignored; invalid values fall back to the definition's default.
 */
export function applyPropertyValues(
  definitions: readonly PromptProperty[],
  values: Record<string, unknown> | undefined,
): PromptProperty[] {
  return definitions.map((definition) => {
    const raw = values?.[definition.key];
    return { ...definition, value: sanitizeValue(definition, raw === undefined ? definition.value : raw) };
  });
}

function sanitizeValue(definition: PromptProperty, raw: unknown): string | string[] {
  const options = definition.options ?? [];
  if (definition.type === "multi-select") {
    const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
    return list.filter((item): item is string => typeof item === "string" && options.includes(item));
  }
  if (definition.type === "select") {
    if (typeof raw === "string" && options.includes(raw)) return raw;
    const fallback = typeof definition.value === "string" ? definition.value : "";
    return options.includes(fallback) ? fallback : options[0] ?? "";
  }
  return typeof raw === "string" ? raw.trim().slice(0, TEXT_VALUE_MAX) : "";
}

/** Validates property definitions supplied by a client (custom prompts). */
export function sanitizeProperties(input: unknown): PromptProperty[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: PromptProperty[] = [];
  for (const item of input.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key) || seen.has(key)) continue;
    const type = record.type === "select" || record.type === "multi-select" ? record.type : "text";
    const options = Array.isArray(record.options)
      ? record.options.filter((option): option is string => typeof option === "string" && option.trim() !== "")
          .map((option) => option.trim().slice(0, 80)).slice(0, 30)
      : undefined;
    if (type !== "text" && (!options || options.length === 0)) continue;
    const definition: PromptProperty = {
      key,
      label: typeof record.label === "string" && record.label.trim() ? record.label.trim().slice(0, 80) : key,
      type,
      ...(options ? { options } : {}),
      ...(typeof record.placeholder === "string" ? { placeholder: record.placeholder.slice(0, 120) } : {}),
      value: type === "multi-select" ? [] : "",
    };
    definition.value = sanitizeValue(definition, record.value);
    seen.add(key);
    result.push(definition);
  }
  return result;
}
