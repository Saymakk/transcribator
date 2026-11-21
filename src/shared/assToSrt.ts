/**
 * ASS/SSA → SRT conversion.
 * Dialogue columns are taken from the file's own Format: line under [Events].
 */

import type { AssFieldCase, AssSrtFormat } from "./types";
import type { MontageCast } from "./montage";
import { formatActorPrefix, prefixCueWithActors } from "./montage";
import {
  applyFieldCase,
  applyFieldWrapper,
  caseForField,
  resolveActorSeparator,
  wrapperForField,
} from "./assSrtPrefs";

export type AssToSrtOptions = {
  /** Column names from the file Format line, in the order to join into cue text. */
  fields: string[];
  /** Separator between fields (e.g. " | ", " · ", " — "). */
  separator: string;
  /** Keep empty field values in the joined string. */
  keepEmpty?: boolean;
  /** Optional wrap per field name, e.g. { Name: "[]" } → [ЛЮСИ]. */
  fieldWrappers?: Record<string, string>;
  /** Wrap for montage actor prefix, e.g. "{}" → {Абрамова}. */
  actorWrapper?: string;
  /** Separator between actor and cue body; null/undefined → use `separator`. */
  actorSeparator?: string | null;
  fieldCases?: Record<string, AssFieldCase>;
  actorCase?: AssFieldCase;
  omitEmptyWrapped?: boolean;
  skipCuesWithoutActor?: boolean;
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

export function optionsFromFormat(
  format: AssSrtFormat,
  montage?: MontageCast | null,
): AssToSrtOptions {
  return {
    fields: format.fields,
    separator: format.separator,
    keepEmpty: format.keepEmpty,
    fieldWrappers: format.fieldWrappers,
    actorWrapper: format.actorWrapper,
    actorSeparator: format.actorSeparator,
    fieldCases: format.fieldCases,
    actorCase: format.actorCase,
    omitEmptyWrapped: format.omitEmptyWrapped,
    skipCuesWithoutActor: format.skipCuesWithoutActor,
    montage,
  };
}

export function formatAssCueBody(row: AssEventRow, options: AssToSrtOptions): string {
  const fields = options.fields.length ? options.fields : ["Text"];
  const sep = options.separator;
  const omitEmptyWrap = options.omitEmptyWrapped !== false;
  const parts = fields.map((f) => {
    let raw = fieldValue(row, f);
    raw = applyFieldCase(raw, caseForField(options.fieldCases, f));
    if (!raw) {
      if (!options.keepEmpty) return "";
      if (omitEmptyWrap) return "";
    }
    return applyFieldWrapper(raw, wrapperForField(options.fieldWrappers, f));
  });
  const filtered = options.keepEmpty ? parts : parts.filter((p) => p.length > 0);
  return filtered.join(sep);
}

function rowRoleName(row: AssEventRow): string {
  const key = Object.keys(row.columns).find((k) => k.toLowerCase() === "name");
  return key ? row.columns[key] ?? "" : "";
}

function actorSepFor(options: AssToSrtOptions): string {
  return resolveActorSeparator({
    separator: options.separator,
    actorSeparator: options.actorSeparator ?? null,
  });
}

export function formatAssCueLine(row: AssEventRow, options: AssToSrtOptions): string | null {
  const role = rowRoleName(row);
  if (options.skipCuesWithoutActor && options.montage) {
    const actor = formatActorPrefix(role, row.start, options.montage);
    if (!actor) return null;
  }
  let body = formatAssCueBody(row, options);
  body = prefixCueWithActors(
    body,
    role,
    row.start,
    options.montage,
    actorSepFor(options),
    options.actorWrapper,
    options.actorCase,
  );
  if (!body.trim() && !options.keepEmpty) return null;
  return body;
}

export function assParsedToSrt(parsed: AssParseResult, options: AssToSrtOptions): string {
  const { rows } = parsed;
  if (rows.length === 0) return "";

  const blocks: string[] = [];
  let index = 1;
  for (const row of rows) {
    const body = formatAssCueLine(row, options);
    if (body === null) continue;
    blocks.push(
      `${index}\n${assTimeToSrt(row.start)} --> ${assTimeToSrt(row.end)}\n${body}`,
    );
    index += 1;
  }
  return blocks.join("\n\n") + (blocks.length ? "\n" : "");
}

export function assToSrt(source: string, options: AssToSrtOptions): string {
  return assParsedToSrt(parseAss(source), options);
}

export function looksLikeAss(text: string): boolean {
  return (
    /\[Script Info\]/i.test(text) ||
    /^Dialogue:/im.test(text) ||
    /\[V4\+? Styles\]/i.test(text) ||
    /\[Events\]/i.test(text)
  );
}

export function formatColumnLabel(name: string): string {
  return name;
}
