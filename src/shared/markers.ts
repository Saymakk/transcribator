/** Adobe-style Marker / Region cue list (plain text, often saved as .xml). */

import {
  formatCueParts,
  partsFromRawText,
  type CueMarkupPreset,
  type CueParts,
} from "./cueMarkup";

export type MarkerKind = "Marker" | "Region";

export type MarkerEntry = {
  id: string;
  kind: MarkerKind;
  start: string;
  end: string;
  /** Serialized comment written to the file. */
  text: string;
  /** Structured Actor / Role / body breakdown when detected or edited. */
  parts: CueParts;
};

export type MarkersDocument = {
  entries: MarkerEntry[];
  /** Original newline style for round-trip save. */
  newline: "\n" | "\r\n";
  /** Trailing newline at end of file. */
  trailingNewline: boolean;
  /** 1-based source line numbers that could not be parsed. */
  invalidLines: number[];
};

const LINE_RE =
  /^(Marker|Region)\s+(\d+:\d{1,2}:\d{2}(?:\.\d+)?)\s*,\s*(\d+:\d{1,2}:\d{2}(?:\.\d+)?)\s*,(.*)$/;

const TIME_RE = /^\d+:\d{1,2}:\d{2}(?:\.\d+)?$/;

let seq = 0;
export function newMarkerId(): string {
  seq += 1;
  return `m_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export function looksLikeMarkers(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  let hits = 0;
  for (const line of lines.slice(0, 40)) {
    if (LINE_RE.test(line)) hits += 1;
  }
  return hits >= 1 && hits / Math.min(lines.length, 40) >= 0.5;
}

export function parseMarkers(text: string): MarkersDocument {
  const newline: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /(?:\r?\n)$/.test(text);
  // Normalize any mix of CR/LF so comments never keep a stray `\r`.
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Drop final empty split from trailing newline.
  if (trailingNewline && rawLines.length && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  const entries: MarkerEntry[] = [];
  const invalidLines: number[] = [];
  rawLines.forEach((line, index) => {
    if (!line.trim()) return;
    // Keep trailing spaces in the comment; only trim the left side for the kind token.
    const m = LINE_RE.exec(line.trimStart());
    if (!m) {
      invalidLines.push(index + 1);
      return;
    }
    const text = m[4] ?? "";
    entries.push({
      id: newMarkerId(),
      kind: m[1] as MarkerKind,
      start: m[2],
      end: m[3],
      text,
      parts: partsFromRawText(text),
    });
  });
  return { entries, newline, trailingNewline, invalidLines };
}

export function serializeMarkers(doc: MarkersDocument): string {
  const lines = doc.entries.map(
    (e) => `${e.kind} ${normalizeTime(e.start)}, ${normalizeTime(e.end)},${e.text}`,
  );
  const body = lines.join(doc.newline);
  if (!body) return doc.trailingNewline ? doc.newline : "";
  return doc.trailingNewline ? body + doc.newline : body;
}

export function normalizeTime(raw: string): string {
  return raw.trim();
}

export function isValidMarkerTime(raw: string): boolean {
  return TIME_RE.test(raw.trim());
}

export function createEmptyEntry(kind: MarkerKind = "Marker"): MarkerEntry {
  return {
    id: newMarkerId(),
    kind,
    start: "0:00:00.000",
    end: "0:00:01.000",
    text: "",
    parts: { actor: "", role: "", body: "" },
  };
}

export function entryTextFromParts(parts: CueParts, preset: CueMarkupPreset): string {
  return formatCueParts(parts, preset);
}

export function withParts(
  entry: MarkerEntry,
  parts: CueParts,
  preset: CueMarkupPreset,
): MarkerEntry {
  const nextParts = {
    actor: parts.actor,
    role: parts.role,
    body: parts.body,
  };
  const structured = Boolean(nextParts.actor.trim() || nextParts.role.trim());
  return {
    ...entry,
    parts: nextParts,
    text: structured ? formatCueParts(nextParts, preset) : nextParts.body,
  };
}

export function reformatEntry(entry: MarkerEntry, preset: CueMarkupPreset): MarkerEntry {
  const structured = Boolean(entry.parts.actor.trim() || entry.parts.role.trim());
  if (!structured) return entry;
  return {
    ...entry,
    text: formatCueParts(entry.parts, preset),
  };
}

export function emptyMarkersDocument(): MarkersDocument {
  return { entries: [], newline: "\n", trailingNewline: true, invalidLines: [] };
}
