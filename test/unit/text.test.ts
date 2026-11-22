import assert from "node:assert/strict";
import test from "node:test";
import { applyPropertyValues, placeholderKeys, renderPromptBody, sanitizeProperties } from "../../src/lib/prompt-render.ts";
import { TEMPLATES, findTemplate } from "../../src/lib/templates.ts";
import { applyReplacements, cleanTitle, fallbackTitle, formatSpeakerSegments } from "../../src/lib/text.ts";
import { formatDuration, slugify } from "../../src/lib/format.ts";
import { audioExtension } from "../../src/lib/limits.ts";
import type { PromptProperty } from "../../src/lib/types.ts";

test("replacements are whole-word, case-insensitive and longest-first", () => {
  const result = applyReplacements("Chat GPT and chat gpt-4 helped. chatgpt? Open AI rocks.", [
    { find: "chat gpt", replaceWith: "ChatGPT" },
    { find: "open ai", replaceWith: "OpenAI" },
    { find: "open", replaceWith: "SHOULD-NOT-WIN" },
    { find: "unused", replaceWith: "x", isActive: false },
  ]);
  assert.equal(result.text, "ChatGPT and ChatGPT-4 helped. chatgpt? OpenAI rocks.");
  assert.equal(result.count, 3);
});

test("replacements respect word boundaries in non-Latin scripts", () => {
  const result = applyReplacements("আমি ঢাকা যাব। ঢাকায় না।", [{ find: "ঢাকা", replaceWith: "Dhaka" }]);
  assert.equal(result.text, "আমি Dhaka যাব। ঢাকায় না।");
});

test("speaker segments merge consecutive turns", () => {
  const text = formatSpeakerSegments([
    { speaker: "A", text: "Hello there." },
    { speaker: "A", text: "How are you?" },
    { speaker: "B", text: "Fine." },
    { speaker: "B", text: " " },
  ]);
  assert.equal(text, "Speaker A: Hello there. How are you?\n\nSpeaker B: Fine.");
});

test("titles: fallback and cleanup", () => {
  assert.equal(fallbackTitle("\n\n  Buy milk and eggs tomorrow before the store closes at nine\nmore"), "Buy milk and eggs tomorrow before the store");
  assert.equal(fallbackTitle(""), "Untitled note");
  assert.equal(cleanTitle('"Weekly Planning Notes."\nextra'), "Weekly Planning Notes");
  assert.equal(cleanTitle("Title: **Trip Ideas**"), "Trip Ideas");
});

test("prompt bodies drop lines whose placeholder is empty", () => {
  const properties: PromptProperty[] = [
    { key: "tone", label: "Tone", type: "multi-select", options: ["Friendly", "Formal"], value: ["Friendly", "Formal"] },
    { key: "name", label: "Name", type: "text", value: "" },
  ];
  const body = "Rewrite it.\n- Tone: {{tone}}\n- Sign as {{ name }}\nDone.";
  assert.equal(renderPromptBody(body, properties), "Rewrite it.\n- Tone: Friendly, Formal\nDone.");
  assert.deepEqual(placeholderKeys(body), ["tone", "name"]);
});

test("property values are validated against their definitions", () => {
  const template = findTemplate("format-and-tone");
  assert.ok(template);
  const applied = applyPropertyValues(template.properties, {
    tone: ["Formal", "Evil"],
    sentence_length: "Gigantic",
    personal_name: "  Farhan  ",
    unknown: "ignored",
  });
  const byKey = Object.fromEntries(applied.map((property) => [property.key, property.value]));
  assert.deepEqual(byKey.tone, ["Formal"]);
  assert.equal(byKey.sentence_length, "Medium");
  assert.equal(byKey.personal_name, "Farhan");
  assert.ok(!("unknown" in byKey));
  const rendered = renderPromptBody(template.body, applied);
  assert.match(rendered, /Sign off with this name: Farhan/);
});

test("custom property definitions are sanitized", () => {
  const properties = sanitizeProperties([
    { key: "ok", type: "select", options: ["a", "b"], value: "b" },
    { key: "bad key!", type: "text" },
    { key: "noopts", type: "select", options: [] },
    { key: "ok", type: "text" },
  ]);
  assert.equal(properties.length, 1);
  assert.equal(properties[0].value, "b");
});

test("every gallery template is well formed", () => {
  const ids = new Set<string>();
  for (const template of TEMPLATES) {
    assert.ok(!ids.has(template.id), `duplicate id ${template.id}`);
    ids.add(template.id);
    const keys = new Set(template.properties.map((property) => property.key));
    for (const key of placeholderKeys(template.body)) assert.ok(keys.has(key), `${template.id} is missing property ${key}`);
    assert.ok(renderPromptBody(template.body, template.properties).length > 20);
  }
  assert.ok(TEMPLATES.length >= 50);
});

test("formatting helpers", () => {
  assert.equal(formatDuration(75), "1:15");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(null), "0:00");
  assert.equal(slugify("Hello, World! Ünïcode"), "hello-world-unicode");
  assert.equal(slugify("!!!"), "note");
  assert.equal(audioExtension("audio/webm;codecs=opus", null), "webm");
  assert.equal(audioExtension("application/octet-stream", "Interview.MOV"), "mov");
  assert.equal(audioExtension("text/plain", "notes.txt"), null);
});
