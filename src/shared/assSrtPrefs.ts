import type { AssSrtPrefs } from "./types";
import { DEFAULT_ASS_SRT_PREFS } from "./types";

export function migrateAssSrtPrefs(raw: unknown): AssSrtPrefs {
  const d = DEFAULT_ASS_SRT_PREFS;
  if (!raw || typeof raw !== "object") return { ...d, fields: [...d.fields] };
  const o = raw as Record<string, unknown>;
  const fields = Array.isArray(o.fields)
    ? o.fields.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [...d.fields];
  return {
    fields: fields.length > 0 ? fields : [...d.fields],
    separator: typeof o.separator === "string" ? o.separator : d.separator,
    keepEmpty: Boolean(o.keepEmpty),
  };
}

/** Apply saved preference order to columns present in the current ASS Format:. */
export function resolveAssFields(
  formatColumns: string[],
  preferred: string[],
): string[] {
  if (formatColumns.length === 0) return [];
  const matched = preferred
    .map((p) => formatColumns.find((c) => c.toLowerCase() === p.toLowerCase()))
    .filter((c): c is string => Boolean(c));
  if (matched.length > 0) return matched;
  const text = formatColumns.find((c) => c.toLowerCase() === "text");
  return text ? [text] : formatColumns.slice(0, 1);
}
