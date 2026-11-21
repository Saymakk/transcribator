/**
 * Shared Actor / Role / Text cue markup — used by Markers editor and ASS→SRT presets.
 *
 * Samples:
 *   Актёр. Роль. Текст
 *   Актёр [Роль] Текст
 *   {Актёр} [Роль] Текст
 */

export type CuePartId = "actor" | "role" | "body";

export type CueParts = {
  actor: string;
  role: string;
  body: string;
};

export type CueMarkupPresetId = "actorRoleDot" | "actorRoleBrackets" | "actorBracesRoleBrackets";

export type CueMarkupPreset = {
  id: CueMarkupPresetId;
  /** Short sample for buttons / labels. */
  sample: string;
  actorWrapper: string;
  roleWrapper: string;
  /** Joiner between non-empty parts (after wraps). */
  separator: string;
};

export const CUE_MARKUP_PRESETS: CueMarkupPreset[] = [
  {
    id: "actorRoleDot",
    sample: "Актёр. Роль. Текст",
    actorWrapper: "",
    roleWrapper: "",
    separator: ". ",
  },
  {
    id: "actorRoleBrackets",
    sample: "Актёр [Роль] Текст",
    actorWrapper: "",
    roleWrapper: "[]",
    separator: " ",
  },
  {
    id: "actorBracesRoleBrackets",
    sample: "{Актёр} [Роль] Текст",
    actorWrapper: "{}",
    roleWrapper: "[]",
    separator: " ",
  },
];

export function cueMarkupPresetById(id: string | null | undefined): CueMarkupPreset {
  return CUE_MARKUP_PRESETS.find((p) => p.id === id) ?? CUE_MARKUP_PRESETS[0];
}

export function applyWrapper(value: string, wrapper: string): string {
  const wrap = wrapper.trim();
  const raw = value;
  if (!wrap) return raw;
  if (wrap.length === 1) return `${wrap}${raw}${wrap}`;
  const mid = Math.floor(wrap.length / 2);
  return `${wrap.slice(0, mid)}${raw}${wrap.slice(mid)}`;
}

export function stripWrapper(value: string, wrapper: string): string {
  const wrap = wrapper.trim();
  const v = value.trim();
  if (!wrap) return value;
  if (wrap.length === 1) {
    if (v.startsWith(wrap) && v.endsWith(wrap) && v.length >= 2) {
      return v.slice(1, -1);
    }
    return value;
  }
  const mid = Math.floor(wrap.length / 2);
  const left = wrap.slice(0, mid);
  const right = wrap.slice(mid);
  if (v.startsWith(left) && v.endsWith(right) && v.length >= left.length + right.length) {
    return v.slice(left.length, v.length - right.length);
  }
  return value;
}

export function formatCueParts(parts: CueParts, preset: CueMarkupPreset): string {
  const chunks: string[] = [];
  const actor = parts.actor.trim();
  const role = parts.role.trim();
  const body = parts.body; // keep intentional leading/trailing spaces only if whole cue is body-only

  if (actor) chunks.push(applyWrapper(actor, preset.actorWrapper));
  if (role) chunks.push(applyWrapper(role, preset.roleWrapper));
  if (body.trim()) chunks.push(body.trim());
  else if (!actor && !role && body) chunks.push(body);

  return chunks.join(preset.separator);
}

const RE_BRACES_BRACKETS = /^\{([^{}]*)\}\s*\[([^[\]]*)\]\s*(.*)$/s;
const RE_ACTOR_BRACKETS = /^(.+?)\s*\[([^[\]]*)\]\s*(.*)$/s;
/** Actor. ROLE. body — ROLE is 2+ uppercase letters (Cyrillic/Latin). */
const RE_DOT_ROLE = /^(.+)\.\s*([A-ZА-ЯЁ]{2,}(?:\s+[A-ZА-ЯЁ0-9]{2,})*)\.\s*(.*)$/su;

export function parseCueParts(raw: string): CueParts | null {
  const line = raw.replace(/\r/g, "");
  if (!line.trim()) return null;

  let m = RE_BRACES_BRACKETS.exec(line.trimStart());
  if (m) {
    return { actor: m[1].trim(), role: m[2].trim(), body: m[3] };
  }

  m = RE_ACTOR_BRACKETS.exec(line.trimStart());
  if (m) {
    return { actor: m[1].trim(), role: m[2].trim(), body: m[3] };
  }

  m = RE_DOT_ROLE.exec(line.trimStart());
  if (m) {
    return { actor: m[1].trim(), role: m[2].trim(), body: m[3] };
  }

  return null;
}

/** Detect which preset best matches an already-structured line. */
export function detectCueMarkupPreset(raw: string): CueMarkupPresetId | null {
  const line = raw.trim();
  if (!line) return null;
  if (RE_BRACES_BRACKETS.test(line)) return "actorBracesRoleBrackets";
  if (RE_ACTOR_BRACKETS.test(line)) return "actorRoleBrackets";
  if (RE_DOT_ROLE.test(line)) return "actorRoleDot";
  return null;
}

export function detectDominantCueMarkup(
  lines: string[],
): CueMarkupPresetId {
  const counts: Record<CueMarkupPresetId, number> = {
    actorRoleDot: 0,
    actorRoleBrackets: 0,
    actorBracesRoleBrackets: 0,
  };
  for (const line of lines) {
    const id = detectCueMarkupPreset(line);
    if (id) counts[id] += 1;
  }
  let best: CueMarkupPresetId = "actorRoleDot";
  let n = -1;
  for (const preset of CUE_MARKUP_PRESETS) {
    if (counts[preset.id] > n) {
      n = counts[preset.id];
      best = preset.id;
    }
  }
  return best;
}

export function emptyCueParts(): CueParts {
  return { actor: "", role: "", body: "" };
}

export function partsFromRawText(raw: string): CueParts {
  return parseCueParts(raw) ?? { actor: "", role: "", body: raw };
}

export function hasStructuredParts(parts: CueParts): boolean {
  return Boolean(parts.actor.trim() || parts.role.trim());
}
