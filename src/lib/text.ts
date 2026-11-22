export interface ReplacementRule {
  find: string;
  replaceWith: string;
  isActive?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Applies whole-word, case-insensitive text replacements (longest phrases first).
 * Works for any script because word boundaries are Unicode-aware.
 */
export function applyReplacements(text: string, rules: readonly ReplacementRule[]): { text: string; count: number } {
  const active = rules
    .filter((rule) => rule.isActive !== false && rule.find.trim())
    .sort((a, b) => b.find.trim().length - a.find.trim().length);
  let result = text;
  let count = 0;
  for (const rule of active) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(rule.find.trim())}(?![\\p{L}\\p{N}_])`, "giu");
    result = result.replace(pattern, () => {
      count += 1;
      return rule.replaceWith;
    });
  }
  return { text: result, count };
}

export interface SpeakerSegment {
  speaker: string;
  text: string;
}

/** Joins consecutive segments by the same speaker into "Speaker A: ..." paragraphs. */
export function formatSpeakerSegments(segments: readonly SpeakerSegment[]): string {
  const blocks: SpeakerSegment[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const speaker = segment.speaker.trim() || "?";
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === speaker) last.text = `${last.text} ${text}`;
    else blocks.push({ speaker, text });
  }
  return blocks
    .map((block) => `${/^speaker\b/i.test(block.speaker) ? block.speaker : `Speaker ${block.speaker}`}: ${block.text}`)
    .join("\n\n");
}

/** Title fallback when AI titles are off or unavailable: the first few words. */
export function fallbackTitle(text: string, fallback = "Untitled note"): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return fallback;
  const cleaned = firstLine.replace(/^speaker [^:]{1,12}:\s*/i, "");
  const words = cleaned.split(/\s+/).slice(0, 8).join(" ");
  return words.length > 60 ? `${words.slice(0, 57).trimEnd()}…` : words;
}

/** Cleans up a model-generated title (quotes, markdown, trailing period). */
export function cleanTitle(raw: string): string {
  return raw
    .split(/\r?\n/)[0]
    .replace(/^(title\s*:\s*)/i, "")
    .replace(/^["'`#*\s]+|["'`*\s.]+$/g, "")
    .trim()
    .slice(0, 120);
}

/** Joins transcript pieces, avoiding doubled spaces or missing separators. */
export function joinTranscriptParts(parts: readonly string[], separator = " "): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(separator);
}
