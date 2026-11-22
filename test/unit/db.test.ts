import assert from "node:assert/strict";
import test from "node:test";
import { parseNotionPageId } from "../../src/server/integrations.ts";
import { defaultSettings } from "../../src/server/settings.ts";
import { validateDictionaryWord } from "../../src/server/vocab.ts";

test("dictionary word validation", () => {
  assert.equal(validateDictionaryWord("  Saydraft   App "), "Saydraft App");
  assert.throws(() => validateDictionaryWord(""), /Enter a word/);
  assert.throws(() => validateDictionaryWord("one two three four five six"), /5 words/);
});

test("notion page url parsing", () => {
  assert.equal(
    parseNotionPageId("https://www.notion.so/My-notes-1234567890abcdef1234567890abcdef?pvs=4"),
    "12345678-90ab-cdef-1234-567890abcdef",
  );
  assert.throws(() => parseNotionPageId("https://example.com/nope"), /Notion page link/);
});

test("default settings include valid defaults", () => {
  const defaults = defaultSettings();
  assert.equal(defaults.defaultLanguage, "auto");
  assert.equal(defaults.autoTitle, true);
});
