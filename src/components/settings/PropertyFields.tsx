"use client";

import type { PromptProperty } from "@/lib/types";

/** Inputs for a prompt's configurable properties (text, select, multi-select). */
export function PropertyFields({ properties, onChange }: { properties: PromptProperty[]; onChange: (key: string, value: string | string[]) => void }) {
  if (properties.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {properties.map((property) => (
        <div key={property.key} className={property.type === "multi-select" ? "sm:col-span-2" : ""}>
          {property.type === "multi-select" ? (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-[var(--ink-muted)]">{property.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {(property.options ?? []).map((option) => {
                  const values = Array.isArray(property.value) ? property.value : [];
                  const on = values.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      data-active={on}
                      aria-pressed={on}
                      className="chip py-1 text-xs"
                      onClick={() => onChange(property.key, on ? values.filter((value) => value !== option) : [...values, option])}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <label className="block text-xs font-medium text-[var(--ink-muted)]">
              {property.label}
              {property.type === "select" ? (
                <select value={String(property.value)} onChange={(event) => onChange(property.key, event.target.value)} className="field mt-1.5 text-[var(--ink)]">
                  {(property.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={String(property.value ?? "")}
                  onChange={(event) => onChange(property.key, event.target.value)}
                  placeholder={property.placeholder}
                  maxLength={500}
                  className="field mt-1.5 text-[var(--ink)]"
                />
              )}
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

export function setPropertyValue(properties: PromptProperty[], key: string, value: string | string[]): PromptProperty[] {
  return properties.map((property) => (property.key === key ? { ...property, value } : property));
}

export function propertyValues(properties: PromptProperty[]): Record<string, string | string[]> {
  return Object.fromEntries(properties.map((property) => [property.key, property.value]));
}
