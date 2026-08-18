/**
 * ASS/SSA → SRT conversion.
 * Dialogue columns are taken from the file's own Format: line under [Events].
 */

import type { MontageCast } from "./montage";
import { prefixCueWithActors } from "./montage";

export type AssToSrtOptions = {
  /** Column names from the file Format line, in the order to join into cue text. */
  fields: string[];
  /** Separator between fields (e.g. " | ", " · ", " — "). */
  separator: string;
  /** Keep empty field values in the joined string. */
  keepEmpty?: boolean;
  /** Optional dubbing montage: prepend actor names before cue text. */
  montage?: MontageCast | null;
};

export type AssEventRow = {
  /** Values keyed by Format column name (original casing from Format). */
  columns: Record<string, string>;
  /** Normalized start/end for SRT timing (from Start/End columns if present). */
  start: string;
  end: string;
};

export type AssParseResult = {
  /** Column names from Format: under [Events], in file order. */
  formatColumns: string[];
  rows: AssEventRow[];
};

const DEFAULT_FORMAT = [
  "Layer",
  "Start",
  "End",
  "Style",
  "Name",
  "MarginL",
  "MarginR",
  "MarginV",
  "Effect",
  "Text",
];

/** H:MM:SS.cc or H:MM:SS.mmm → SRT HH:MM:SS,mmm */
export function assTimeToSrt(t: string): string {
  const m = t.trim().match(/^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/);
  if (!m) return "00:00:00,000";
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  let frac = m[4];
  if (frac.length === 1) frac = frac + "00";
  else if (frac.length === 2) frac = frac + "0";
  else frac = frac.slice(0, 3);
  const hh = String(h).padStart(2, "0");
  return `${hh}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")},${frac}`;
}

/** Strip ASS override tags like {\an8}, {\i1}, etc., keep \\N as newline. */
export function stripAssTags(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\[nN]/g, "\n")
    .replace(/\\h/g, " ")
    .replace(/\\[a-zA-Z]+\d*/g, "")
    .trim();
}

function splitAssCsv(line: string, limit: number): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "," && parts.length < limit - 1) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

function findColumn(columns: string[], name: string): string | undefined {
  const needle = name.toLowerCase();
  return columns.find((c) => c.toLowerCase() === needle);
}

/**
 * Parse Format: from [Events] (or fallback default) and all Dialogue rows.
 */
export function parseAss(source: string): AssParseResult {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  let inEvents = false;
  let formatColumns: string[] | null = null;
  const rows: AssEventRow[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue;

    if (/^\[/.test(line)) {
      inEvents = /^\[Events\]/i.test(line);
      continue;
    }

    if (inEvents && /^Format:/i.test(line)) {
      formatColumns = line
        .replace(/^Format:\s*/i, "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      continue;
    }

    if (!/^Dialogue:/i.test(line)) continue;

    const cols = formatColumns?.length ? formatColumns : DEFAULT_FORMAT;
    const body = line.replace(/^Dialogue:\s*/i, "");
    // Text is always last and may contain commas
    const textIdx = cols.findIndex((c) => c.toLowerCase() === "text");
    const splitLimit = textIdx >= 0 ? textIdx + 1 : cols.length;
    const parts = splitAssCsv(body, splitLimit);

    const columns: Record<string, string> = {};
    for (let i = 0; i < cols.length; i += 1) {
      const name = cols[i];
      if (textIdx >= 0 && i === textIdx) {
        columns[name] = parts.slice(i).join(",").trim();
      } else {
        columns[name] = (parts[i] ?? "").trim();
      }
    }

    const startKey = findColumn(cols, "Start");
    const endKey = findColumn(cols, "End");
    rows.push({
      columns,
      start: startKey ? columns[startKey] ?? "" : "",
      end: endKey ? columns[endKey] ?? "" : "",
    });
  }

  return {
    formatColumns: formatColumns?.length ? formatColumns : DEFAULT_FORMAT,
    rows,
  };
}

/** @deprecated use parseAss */
export function parseAssDialogues(source: string): AssEventRow[] {
  return parseAss(source).rows;
}

function fieldValue(row: AssEventRow, field: string): string {
  const key = Object.keys(row.columns).find((k) => k.toLowerCase() === field.toLowerCase());
  const raw = key ? row.columns[key] : "";
  if (key && key.toLowerCase() === "text") return stripAssTags(raw);
  return raw;
}

export function formatAssCueBody(row: AssEventRow, options: AssToSrtOptions): string {
  const fields = options.fields.length ? options.fields : ["Text"];
  const sep = options.separator;
  const parts = fields.map((f) => fieldValue(row, f));
  const filtered = options.keepEmpty ? parts : parts.filter((p) => p.length > 0);
  return filtered.join(sep);
}

function rowRoleName(row: AssEventRow): string {
  const key = Object.keys(row.columns).find((k) => k.toLowerCase() === "name");
  return key ? row.columns[key] ?? "" : "";
}

export function assToSrt(source: string, options: AssToSrtOptions): string {
  const { rows } = parseAss(source);
  if (rows.length === 0) return "";

  const blocks: string[] = [];
  let index = 1;
  for (const row of rows) {
    let body = formatAssCueBody(row, options);
    body = prefixCueWithActors(body, rowRoleName(row), row.start, options.montage);
    if (!body.trim() && !options.keepEmpty) continue;
    blocks.push(
      `${index}\n${assTimeToSrt(row.start)} --> ${assTimeToSrt(row.end)}\n${body}`,
    );
    index += 1;
  }
  return blocks.join("\n\n") + (blocks.length ? "\n" : "");
}

export function looksLikeAss(text: string): boolean {
  return (
    /\[Script Info\]/i.test(text) ||
    /^Dialogue:/im.test(text) ||
    /\[V4\+? Styles\]/i.test(text) ||
    /\[Events\]/i.test(text)
  );
}

/** Prefer Text column for default selection when present. */
export function defaultSelectedFields(formatColumns: string[]): string[] {
  const text = formatColumns.find((c) => c.toLowerCase() === "text");
  return text ? [text] : formatColumns.slice(0, 1);
}
