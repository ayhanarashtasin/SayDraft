"use client";

/**
 * Crash-safe recording journal. Every second of audio is written to IndexedDB while
 * recording, so a closed tab, crash or failed upload never loses a recording.
 */

export interface JournalSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  mimeType: string;
  source: "recording" | "meeting";
  appendTo: number | null;
  language: string;
  speakers: boolean;
  /** Duration in ms of each finished segment, by segment index. */
  segments: Record<number, number>;
  /** Total recorded time so far (ms). */
  activeMs: number;
  /** Number of saved one-second chunks (filled in by listSessions). */
  chunkCount?: number;
}

interface ChunkRecord {
  id?: number;
  sessionId: string;
  segment: number;
  seq: number;
  blob: Blob;
}

export interface RecoveredSegment {
  index: number;
  blob: Blob;
  durationMs: number;
}

const DB_NAME = "saydraft-journal";
const DB_VERSION = 1;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available."));
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) {
        const chunks = db.createObjectStore("chunks", { keyPath: "id", autoIncrement: true });
        chunks.createIndex("bySession", "sessionId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

export async function saveSession(session: JournalSession): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put({ ...session, updatedAt: Date.now() });
  await done(tx);
}

export async function appendChunk(sessionId: string, segment: number, seq: number, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("chunks", "readwrite");
  tx.objectStore("chunks").add({ sessionId, segment, seq, blob } satisfies ChunkRecord);
  await done(tx);
}

export async function listSessions(): Promise<JournalSession[]> {
  try {
    const db = await openDb();
    const sessions = await promisify(db.transaction("sessions").objectStore("sessions").getAll() as IDBRequest<JournalSession[]>);
    const index = db.transaction("chunks").objectStore("chunks").index("bySession");
    const counts = await Promise.all(sessions.map((session) => promisify(index.count(session.id))));
    return sessions
      .map((session, i) => ({ ...session, chunkCount: counts[i] }))
      .sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

/** Rebuilds each segment's audio file from its saved one-second chunks. */
export async function loadSegments(session: JournalSession): Promise<RecoveredSegment[]> {
  const db = await openDb();
  const chunks = await promisify(
    db.transaction("chunks").objectStore("chunks").index("bySession").getAll(session.id) as IDBRequest<ChunkRecord[]>,
  );
  const bySegment = new Map<number, ChunkRecord[]>();
  for (const chunk of chunks) {
    const list = bySegment.get(chunk.segment) ?? [];
    list.push(chunk);
    bySegment.set(chunk.segment, list);
  }
  return [...bySegment.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, list]) => {
      list.sort((a, b) => a.seq - b.seq);
      return {
        index,
        blob: new Blob(list.map((chunk) => chunk.blob), { type: session.mimeType || list[0]?.blob.type || "audio/webm" }),
        // Unfinished segments: estimate from the number of one-second chunks.
        durationMs: session.segments[index] ?? list.length * 1000,
      };
    });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["sessions", "chunks"], "readwrite");
  tx.objectStore("sessions").delete(id);
  const index = tx.objectStore("chunks").index("bySession");
  const keys = await promisify(index.getAllKeys(id));
  for (const key of keys) tx.objectStore("chunks").delete(key);
  await done(tx);
}
