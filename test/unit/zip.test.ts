import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { parseRange } from "../../src/server/files.ts";
import { zipChunks } from "../../src/server/zip.ts";

interface ParsedEntry {
  name: string;
  data: Buffer;
}

/** Reads a stored (uncompressed) zip via its central directory and verifies CRCs. */
export function readZip(buffer: Buffer): ParsedEntry[] {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "end of central directory not found");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ParsedEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "central header signature");
    const crc = buffer.readUInt32LE(offset + 16);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, "local header signature");
    const localName = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    const data = buffer.subarray(start, start + size);
    assert.equal(zlib.crc32(data) >>> 0, crc, `crc of ${name}`);
    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("zip writer produces a valid archive with text and file entries", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saydraft-zip-"));
  try {
    const audio = path.join(dir, "clip.bin");
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
    fs.writeFileSync(audio, bytes);
    const chunks: Buffer[] = [];
    for await (const chunk of zipChunks([
      { name: "notes/hello.md", data: "# Hello\n\nবাংলা text ✓" },
      { name: "audio/clip.bin", filePath: audio },
      { name: "notes/hello.md", data: "duplicate name" },
      { name: "missing.bin", filePath: path.join(dir, "nope.bin") },
    ])) {
      chunks.push(chunk);
    }
    const entries = readZip(Buffer.concat(chunks));
    assert.deepEqual(entries.map((entry) => entry.name), ["notes/hello.md", "audio/clip.bin", "notes/hello-2.md"]);
    assert.equal(entries[0].data.toString("utf8"), "# Hello\n\nবাংলা text ✓");
    assert.ok(entries[1].data.equals(bytes));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("byte ranges, including suffix ranges", () => {
  assert.deepEqual(parseRange("bytes=0-3", 10), { start: 0, end: 3 });
  assert.deepEqual(parseRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(parseRange("bytes=-4", 10), { start: 6, end: 9 });
  assert.deepEqual(parseRange("bytes=-40", 10), { start: 0, end: 9 });
  assert.deepEqual(parseRange("bytes=2-100", 10), { start: 2, end: 9 });
  assert.equal(parseRange("bytes=10-", 10), null);
  assert.equal(parseRange("bytes=-", 10), null);
  assert.equal(parseRange("bytes=5-2", 10), null);
  assert.equal(parseRange("items=0-1", 10), null);
});
