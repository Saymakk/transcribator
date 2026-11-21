import type { AssFieldCase, AssSrtFormat, AssSrtPrefs, AssSrtProfile } from "./types";
import { DEFAULT_ASS_SRT_PREFS } from "./types";

const CASE_MODES = new Set<AssFieldCase>(["as-is", "upper", "lower"]);

function normalizeWrappers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = trimmed;
  }
  return out;
}

function normalizeCases(raw: unknown): Record<string, AssFieldCase> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, AssFieldCase> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (typeof value !== "string" || !CASE_MODES.has(value as AssFieldCase)) continue;
    out[key] = value as AssFieldCase;
  }
  return out;
}

function normalizeCaseMode(raw: unknown, fallback: AssFieldCase): AssFieldCase {
  return typeof raw === "string" && CASE_MODES.has(raw as AssFieldCase)
    ? (raw as AssFieldCase)
    : fallback;
}

function normalizeFormat(raw: Record<string, unknown>, d: AssSrtFormat): AssSrtFormat {
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [...d.fields];
  let actorSeparator: string | null = d.actorSeparator;
  if (raw.actorSeparator === null) actorSeparator = null;
  else if (typeof raw.actorSeparator === "string") actorSeparator = raw.actorSeparator;

  return {
    fields: fields.length > 0 ? fields : [...d.fields],
    separator: typeof raw.separator === "string" ? raw.separator : d.separator,
    keepEmpty: Boolean(raw.keepEmpty),
    fieldWrappers: normalizeWrappers(raw.fieldWrappers),
    actorWrapper: typeof raw.actorWrapper === "string" ? raw.actorWrapper.trim() : d.actorWrapper,
    actorSeparator,
    fieldCases: normalizeCases(raw.fieldCases),
    actorCase: normalizeCaseMode(raw.actorCase, d.actorCase),
    omitEmptyWrapped:
      typeof raw.omitEmptyWrapped === "boolean" ? raw.omitEmptyWrapped : d.omitEmptyWrapped,
    skipCuesWithoutActor: Boolean(raw.skipCuesWithoutActor),
  };
}

function normalizeProfile(raw: unknown): AssSrtProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    ...normalizeFormat(o, DEFAULT_ASS_SRT_PREFS),
  };
}

export function migrateAssSrtPrefs(raw: unknown): AssSrtPrefs {
  const d = DEFAULT_ASS_SRT_PREFS;
  if (!raw || typeof raw !== "object") {
    return clonePrefs(d);
  }
  const o = raw as Record<string, unknown>;
  const format = normalizeFormat(o, d);
  const profiles = Array.isArray(o.profiles)
    ? o.profiles.map(normalizeProfile).filter((p): p is AssSrtProfile => p !== null)
    : [];
  return { ...format, profiles };
}

export function cloneFormat(format: AssSrtFormat): AssSrtFormat {
  return {
    ...format,
    fields: [...format.fields],
    fieldWrappers: { ...format.fieldWrappers },
    fieldCases: { ...format.fieldCases },
  };
}

export function clonePrefs(prefs: AssSrtPrefs): AssSrtPrefs {
  return {
    ...cloneFormat(prefs),
    profiles: prefs.profiles.map((p) => ({ ...cloneFormat(p), id: p.id, name: p.name })),
  };
}

export function formatSnapshot(prefs: AssSrtPrefs | AssSrtFormat): AssSrtFormat {
  return cloneFormat(prefs);
}

export function applyFormatToPrefs(prefs: AssSrtPrefs, format: AssSrtFormat): AssSrtPrefs {
  return {
    ...cloneFormat(format),
    profiles: prefs.profiles.map((p) => ({ ...cloneFormat(p), id: p.id, name: p.name })),
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

/** Look up a wrapper by field name (case-insensitive). */
export function wrapperForField(
  wrappers: Record<string, string> | undefined,
  field: string,
): string {
  if (!wrappers) return "";
  const needle = field.toLowerCase();
  const hit = Object.entries(wrappers).find(([key]) => key.toLowerCase() === needle);
  return hit?.[1]?.trim() ?? "";
}

export function caseForField(
  cases: Record<string, AssFieldCase> | undefined,
  field: string,
): AssFieldCase {
  if (!cases) return "as-is";
  const needle = field.toLowerCase();
  const hit = Object.entries(cases).find(([key]) => key.toLowerCase() === needle);
  return hit?.[1] ?? "as-is";
}

export function applyFieldCase(value: string, mode: AssFieldCase | undefined): string {
  if (!value || !mode || mode === "as-is") return value;
  if (mode === "upper") return value.toLocaleUpperCase("ru-RU");
  if (mode === "lower") return value.toLocaleLowerCase("ru-RU");
  return value;
}

/**
 * Wrap a value with a pair like "[]", "{}", "()", "«»".
 * Odd-length strings put the middle character after the value.
 */
export function applyFieldWrapper(value: string, wrapper: string): string {
  const w = wrapper.trim();
  if (!w) return value;
  if (w.length === 1) return `${w}${value}${w}`;
  const mid = Math.floor(w.length / 2);
  return `${w.slice(0, mid)}${value}${w.slice(mid)}`;
}

export function resolveActorSeparator(format: Pick<AssSrtFormat, "separator" | "actorSeparator">): string {
  return format.actorSeparator === null ? format.separator : format.actorSeparator;
}

export function wrappersEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const aa = normalizeWrappers(a);
  const bb = normalizeWrappers(b);
  const keysA = Object.keys(aa);
  const keysB = Object.keys(bb);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const other = Object.entries(bb).find(([k]) => k.toLowerCase() === key.toLowerCase());
    return other?.[1] === aa[key];
  });
}

export function casesEqual(
  a: Record<string, AssFieldCase> | undefined,
  b: Record<string, AssFieldCase> | undefined,
): boolean {
  const aa = normalizeCases(a);
  const bb = normalizeCases(b);
  const keysA = Object.keys(aa);
  const keysB = Object.keys(bb);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const other = Object.entries(bb).find(([k]) => k.toLowerCase() === key.toLowerCase());
    return other?.[1] === aa[key];
  });
}

export function formatsEqual(a: AssSrtFormat, b: AssSrtFormat): boolean {
  return (
    a.separator === b.separator &&
    a.keepEmpty === b.keepEmpty &&
    a.actorWrapper === b.actorWrapper &&
    a.actorSeparator === b.actorSeparator &&
    a.actorCase === b.actorCase &&
    a.omitEmptyWrapped === b.omitEmptyWrapped &&
    a.skipCuesWithoutActor === b.skipCuesWithoutActor &&
    a.fields.length === b.fields.length &&
    a.fields.every((f, i) => f === b.fields[i]) &&
    wrappersEqual(a.fieldWrappers, b.fieldWrappers) &&
    casesEqual(a.fieldCases, b.fieldCases)
  );
}

export type AssFormatPresetId =
  | "actorRoleDot"
  | "actorRoleBrackets"
  | "actorBracesRoleBrackets";

export type AssFormatPreset = {
  id: AssFormatPresetId;
  /** Preferred fields if present in the ASS Format line. */
  preferredFields: string[];
  format: Omit<AssSrtFormat, "fields">;
};

/** Актёр. Роль. Текст / Актёр [Роль] Текст / {Актёр} [Роль] Текст */
export const ASS_FORMAT_PRESETS: AssFormatPreset[] = [
  {
    id: "actorRoleDot",
    preferredFields: ["Name", "Text"],
    format: {
      separator: ". ",
      keepEmpty: false,
      fieldWrappers: {},
      actorWrapper: "",
      actorSeparator: ". ",
      fieldCases: {},
      actorCase: "as-is",
      omitEmptyWrapped: true,
      skipCuesWithoutActor: false,
    },
  },
  {
    id: "actorRoleBrackets",
    preferredFields: ["Name", "Text"],
    format: {
      separator: " ",
      keepEmpty: false,
      fieldWrappers: { Name: "[]" },
      actorWrapper: "",
      actorSeparator: " ",
      fieldCases: {},
      actorCase: "as-is",
      omitEmptyWrapped: true,
      skipCuesWithoutActor: false,
    },
  },
  {
    id: "actorBracesRoleBrackets",
    preferredFields: ["Name", "Text"],
    format: {
      separator: " ",
      keepEmpty: false,
      fieldWrappers: { Name: "[]" },
      actorWrapper: "{}",
      actorSeparator: " ",
      fieldCases: {},
      actorCase: "as-is",
      omitEmptyWrapped: true,
      skipCuesWithoutActor: false,
    },
  },
];

export function applyAssPreset(
  preset: AssFormatPreset,
  formatColumns: string[],
): AssSrtFormat {
  const fields = resolveAssFields(formatColumns, preset.preferredFields);
  return {
    ...cloneFormat({ fields, ...preset.format }),
  };
}
