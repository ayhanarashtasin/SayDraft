import path from "node:path";
import { languageLabel } from "../lib/languages.ts";
import { slugify } from "../lib/format.ts";
import type { Note } from "../lib/types.ts";
import { listActions } from "./integrations.ts";
import { getNote, listAudioRows } from "./notes.ts";
import { listPrompts } from "./prompts.ts";
import { getSettings } from "./settings.ts";
import { assertOk, streamAudioObject, supabase } from "./supabase.ts";
import { listTags } from "./tags.ts";
import { listDictionary, listReplacements } from "./vocab.ts";
import type { ZipEntry } from "./zip.ts";

function audioEntryName(note: Note, position: number, fileName: string): string {
  return `audio/${note.id}-${slugify(note.title)}-${position + 1}${path.extname(fileName)}`;
}

function noteMarkdown(note: Note, audioNames: string[]): string {
  const lines = [
    `# ${note.title || "Untitled note"}`,
    "",
    `- Created: ${new Date(note.createdAt).toISOString()}`,
    `- Updated: ${new Date(note.updatedAt).toISOString()}`,
    `- Source: ${note.source}`,
    `- Speaker's language: ${languageLabel(note.language)}`,
  ];
  if (note.tags.length) lines.push(`- Tags: ${note.tags.map((tag) => tag.title).join(", ")}`);
  if (note.archived) lines.push("- Archived: yes");
  for (const name of audioNames) lines.push(`- Audio: ../${name}`);
  lines.push("", "## Transcript", "", note.transcript.trim() || "(empty)");
  for (const rewrite of [...note.rewrites].reverse()) {
    if (rewrite.status !== "ready") continue;
    lines.push("", `## ${rewrite.label}`, "", rewrite.text.trim());
  }
  return `${lines.join("\n")}\n`;
}

async function* noteIds() {
  let lastId = 0;
  const pageSize = 200;
  for (;;) {
    const rows = assertOk(await supabase().from("notes").select("id").gt("id", lastId).order("id").limit(pageSize)) as Array<{ id: number }>;
    for (const row of rows) yield Number(row.id);
    if (rows.length < pageSize) return;
    lastId = Number(rows[rows.length - 1].id);
  }
}

/** Everything in the library: a JSON backup, one Markdown file per note, and the audio files. */
export async function* exportEntries(signal?: AbortSignal): AsyncGenerator<ZipEntry> {
  const exportedNotes: unknown[] = [];
  const audioItems: Array<{ name: string; fileName: string; modified: Date }> = [];

  for await (const id of noteIds()) {
    signal?.throwIfAborted();
    const note = await getNote(id);
    if (!note) continue;
    const fileRows = await listAudioRows(id);
    const audioNames = fileRows.map((file) => audioEntryName(note, file.position, file.file_name));
    fileRows.forEach((file, index) => {
      audioItems.push({ name: audioNames[index], fileName: file.file_name, modified: new Date(note.createdAt) });
    });
    exportedNotes.push({ ...note, audioFiles: note.audioFiles.map((file, index) => ({ ...file, archivePath: audioNames[index] })) });
    yield {
      name: `notes/${note.id}-${slugify(note.title)}.md`,
      data: noteMarkdown(note, audioNames),
      modified: new Date(note.updatedAt),
    };
  }

  const [settings, tags, prompts, dictionary, replacements, actions] = await Promise.all([
    getSettings(),
    listTags(),
    listPrompts(),
    listDictionary(),
    listReplacements(),
    listActions(),
  ]);

  const backup = {
    app: "Saydraft",
    format: 1,
    exportedAt: new Date().toISOString(),
    settings,
    tags,
    prompts,
    dictionary,
    replacements,
    integrations: actions.map(({ id, type, title, target, onTranscript, onRewrite }) => ({ id, type, title, target, onTranscript, onRewrite })),
    notes: exportedNotes,
  };
  yield { name: "saydraft-backup.json", data: JSON.stringify(backup, null, 2) };

  for (const item of audioItems) {
    yield { name: item.name, modified: item.modified, open: () => streamAudioObject(item.fileName, signal) };
  }
}
