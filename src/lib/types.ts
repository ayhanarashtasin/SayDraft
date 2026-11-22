// Shared data shapes used by the API routes and the React client.

export type NoteStatus = "uploading" | "processing" | "ready" | "failed";
export type NoteSource = "recording" | "meeting" | "upload" | "text" | "merge";
export type SortMode = "updatedAt" | "createdAt";
export type NoteFilter = "all" | "unsorted" | "archive" | "tag";

export interface Tag {
  id: number;
  title: string;
  color: string;
  position: number;
  noteCount?: number;
  createdAt: number;
}

export interface AudioFile {
  id: number;
  noteId: number;
  mime: string;
  size: number;
  durationSec: number | null;
  originalName: string | null;
  position: number;
  status: "pending" | "ready" | "failed";
  createdAt: number;
}

export type RewriteKind = "rewrite" | "translation" | "instruction";
export type RewriteStatus = "processing" | "ready" | "failed";

export interface Rewrite {
  id: number;
  noteId: number;
  kind: RewriteKind;
  promptId: number | null;
  label: string;
  language: string | null;
  instruction: string | null;
  sourceRewriteId: number | null;
  status: RewriteStatus;
  error: string | null;
  text: string;
  createdAt: number;
  updatedAt: number;
}

interface NoteBase {
  id: number;
  title: string;
  status: NoteStatus;
  stage: string | null;
  progress: number | null;
  error: string | null;
  source: NoteSource;
  language: string | null;
  speakers: boolean;
  archived: boolean;
  durationSec: number | null;
  tags: Tag[];
  createdAt: number;
  updatedAt: number;
}

export interface Note extends NoteBase {
  transcript: string;
  audioFiles: AudioFile[];
  rewrites: Rewrite[];
}

/** Lightweight shape used by the notes feed. */
export interface NoteListItem extends NoteBase {
  preview: string;
  audioCount: number;
  rewriteCount: number;
  rewritesProcessing: number;
}

export type PropertyType = "text" | "select" | "multi-select";

export interface PromptProperty {
  key: string;
  label: string;
  type: PropertyType;
  options?: string[];
  placeholder?: string;
  value: string | string[];
}

export interface Prompt {
  id: number;
  title: string;
  description: string;
  category: string;
  body: string;
  properties: PromptProperty[];
  model: string | null;
  builtinKey: string | null;
  templateId: string | null;
  isFavorite: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Template {
  id: string;
  title: string;
  description: string;
  category: string;
  body: string;
  properties: PromptProperty[];
  featured?: boolean;
}

export interface DictionaryEntry {
  id: number;
  word: string;
  createdAt: number;
}

export interface Replacement {
  id: number;
  find: string;
  replaceWith: string;
  isActive: boolean;
  createdAt: number;
}

export type ActionType = "webhook" | "notion";

export interface IntegrationAction {
  id: number;
  type: ActionType;
  title: string;
  /** Webhook URL, or the Notion parent page id. Secrets are never returned. */
  target: string;
  hasToken: boolean;
  onTranscript: boolean;
  onRewrite: boolean;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  transcribeModel: string;
  rewriteModel: string;
  /** Empty string turns speaker separation off. */
  diarizeModel: string;
  defaultLanguage: string;
  autoTitle: boolean;
  autoReplacements: boolean;
  useDictionary: boolean;
  autoRewritePromptId: number | null;
}

export interface AppLimits {
  maxRecordingSec: number;
  recordingSegmentSec: number;
  maxUploadBytes: number;
  directTranscribeMaxBytes: number;
}

export interface AppStatus {
  configured: boolean;
  ffmpeg: boolean;
  plan: "pro_plus";
  limits: AppLimits;
  settings: AppSettings;
  speakersAvailable: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
