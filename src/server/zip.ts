import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Minimal streaming ZIP writer (stored entries, no compression: audio is already
 * compressed). Remote entries use data descriptors so they can stream from
 * Storage while their size and checksum are computed. Large archives use ZIP64.
 */

export interface ZipEntry {
  name: string;
  data?: string | Uint8Array;
  filePath?: string;
  open?: () => Promise<ReadableStream<Uint8Array> | null>;
  modified?: Date;
}

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function fileCrc(filePath: string): Promise<{ crc: number; size: number }> {
  let crc = 0;
  let size = 0;
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1 << 20 })) {
    crc = zlib.crc32(chunk as Buffer, crc);
    size += (chunk as Buffer).length;
  }
  return { crc, size };
}

interface CentralRecord {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  streamed?: boolean;
}

function localHeader(name: Buffer, crc: number, size: number, time: number, date: number, streamed = false): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(streamed ? 0x0808 : 0x0800, 6); // UTF-8 names, optional data descriptor
  header.writeUInt16LE(0, 8); // stored
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(crc >>> 0, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name]);
}

function centralHeader(record: CentralRecord): Buffer {
  const needs64 = record.offset >= MAX32;
  const extra = needs64 ? Buffer.alloc(12) : Buffer.alloc(0);
  if (needs64) {
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(8, 2);
    extra.writeBigUInt64LE(BigInt(record.offset), 4);
  }
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(needs64 ? 45 : 20, 4); // version made by
  header.writeUInt16LE(needs64 ? 45 : 20, 6); // version needed
  header.writeUInt16LE(record.streamed ? 0x0808 : 0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(record.time, 12);
  header.writeUInt16LE(record.date, 14);
  header.writeUInt32LE(record.crc >>> 0, 16);
  header.writeUInt32LE(record.size, 20);
  header.writeUInt32LE(record.size, 24);
  header.writeUInt16LE(record.name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number
  header.writeUInt16LE(0, 36); // internal attributes
  header.writeUInt32LE(0, 38); // external attributes
  header.writeUInt32LE(needs64 ? MAX32 : record.offset, 42);
  return Buffer.concat([header, record.name, extra]);
}

function endRecords(count: number, cdOffset: number, cdSize: number): Buffer {
  const parts: Buffer[] = [];
  const needs64 = count >= MAX16 || cdOffset >= MAX32 || cdSize >= MAX32;
  if (needs64) {
    const zip64End = Buffer.alloc(56);
    zip64End.writeUInt32LE(0x06064b50, 0);
    zip64End.writeBigUInt64LE(44n, 4);
    zip64End.writeUInt16LE(45, 12);
    zip64End.writeUInt16LE(45, 14);
    zip64End.writeUInt32LE(0, 16);
    zip64End.writeUInt32LE(0, 20);
    zip64End.writeBigUInt64LE(BigInt(count), 24);
    zip64End.writeBigUInt64LE(BigInt(count), 32);
    zip64End.writeBigUInt64LE(BigInt(cdSize), 40);
    zip64End.writeBigUInt64LE(BigInt(cdOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(zip64End, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Math.min(count, MAX16), 8);
  end.writeUInt16LE(Math.min(count, MAX16), 10);
  end.writeUInt32LE(Math.min(cdSize, MAX32), 12);
  end.writeUInt32LE(Math.min(cdOffset, MAX32), 16);
  end.writeUInt16LE(0, 20);
  parts.push(end);
  return Buffer.concat(parts);
}

/** Produces the archive as a stream of chunks. Entries with a missing file are skipped. */
export async function* zipChunks(entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): AsyncGenerator<Buffer> {
  const central: CentralRecord[] = [];
  const names = new Set<string>();
  let offset = 0;
  for await (const entry of entries) {
    let name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (names.has(name)) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)}-${names.size}${name.slice(dot)}` : `${name}-${names.size}`;
    }
    names.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    const { time, date } = dosDateTime(entry.modified ?? new Date());
    if (entry.open) {
      const stream = await entry.open();
      if (!stream) continue;
      const header = localHeader(nameBytes, 0, 0, time, date, true);
      const entryOffset = offset;
      let crc = 0;
      let size = 0;
      try {
        yield header;
        for await (const chunk of stream) {
          size += chunk.byteLength;
          if (size >= MAX32) throw new Error("A ZIP entry exceeds 4 GB.");
          crc = zlib.crc32(chunk, crc);
          yield Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        }
      } finally {
        if (!stream.locked) await stream.cancel().catch(() => undefined);
      }
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(crc >>> 0, 4);
      descriptor.writeUInt32LE(size, 8);
      descriptor.writeUInt32LE(size, 12);
      central.push({ name: nameBytes, crc, size, offset: entryOffset, time, date, streamed: true });
      offset += header.length + size + descriptor.length;
      yield descriptor;
    } else if (entry.filePath) {
      if (!fs.existsSync(entry.filePath)) continue;
      const { crc, size } = await fileCrc(entry.filePath);
      if (size >= MAX32) continue; // a single file over 4 GB is not supported
      const header = localHeader(nameBytes, crc, size, time, date);
      central.push({ name: nameBytes, crc, size, offset, time, date });
      yield header;
      offset += header.length;
      for await (const chunk of fs.createReadStream(entry.filePath, { highWaterMark: 1 << 20 })) {
        yield chunk as Buffer;
      }
      offset += size;
    } else {
      const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data ?? new Uint8Array());
      const crc = zlib.crc32(data);
      const header = localHeader(nameBytes, crc, data.length, time, date);
      central.push({ name: nameBytes, crc, size: data.length, offset, time, date });
      yield header;
      yield data;
      offset += header.length + data.length;
    }
  }
  const cdOffset = offset;
  let cdSize = 0;
  for (const record of central) {
    const header = centralHeader(record);
    cdSize += header.length;
    yield header;
  }
  yield endRecords(central.length, cdOffset, cdSize);
}

export function zipStream(entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator = zipChunks(entries);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
