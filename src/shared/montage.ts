/**
 * Dubbing montage: actor name first, then the list of their roles.
 */

export type MontageLine = {
  text: string;
  colored?: boolean;
};

export type MontageActor = {
  name: string;
  roles: string[];
};

export type MontageCast = {
  actors: MontageActor[];
  /** Role code (normalized) → actors in montage order. */
  roleToActors: Map<string, string[]>;
  /** Roles whose [ROLE] tags (or cues) are highlighted in the montage. */
  coloredRoles: Set<string>;
  /** Cue clocks like "0:01:13" whose montage block is highlighted. */
  coloredTimes: Set<string>;
};

const ROLE_TAG = /^\[([^\]]+)\]$/;
const CLOCK = /(?:^|\s)(\d{1,2}:\d{2}:\d{2})(?:\s|$)/;

export function normalizeRole(raw: string): string {
  return raw.replace(/^\[|\]$/g, "").replace(/\s+/g, "").toUpperCase();
}

/** ASS `0:01:13.07` / montage `00:01:13` → `0:01:13` */
export function normalizeClock(raw: string): string {
  const m = raw.trim().match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${Number(m[1])}:${m[2]}:${m[3]}`;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    );
}

export function montageLinesFromPlainText(text: string): MontageLine[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => ({ text: line, colored: false }));
}

function isRoleToken(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 48) return false;
  if (/\s/.test(t)) return false;
  if (/[.,!?;:]/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return /^[\p{L}\p{N}]+$/u.test(t);
}

function looksLikeActorName(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 80) return false;
  if (ROLE_TAG.test(t)) return false;
  if (/\d{1,2}:\d{2}/.test(t)) return false;
  if (/[.!?]/.test(t)) return false;
  return /\p{L}/u.test(t);
}

export function parseActorLine(
  text: string,
  knownRoles?: Set<string>,
): MontageActor | null {
  const raw = text.replace(/\s+/g, " ").trim().replace(/,+$/, "");
  if (!raw) return null;

  let actor = "";
  let roleParts: string[] = [];

  // Preferred montage form: "SURNAME: ROLE1, ROLE2, ROLE3"
  const colon = raw.indexOf(":");
  if (colon > 0) {
    actor = raw.slice(0, colon).trim();
    roleParts = raw
      .slice(colon + 1)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  } else {
    // Legacy form: "SURNAME, ROLE1, ROLE2"
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return null;
    actor = parts[0];
    roleParts = parts.slice(1);
  }

  if (roleParts.length === 0) return null;
  if (!looksLikeActorName(actor) || !roleParts.every(isRoleToken)) return null;
  if (knownRoles && knownRoles.size > 0) {
    if (knownRoles.has(normalizeRole(actor))) return null;
    const hits = roleParts.filter((r) => knownRoles.has(normalizeRole(r))).length;
    if (hits === 0) return null;
  }
  return { name: actor, roles: roleParts.map(normalizeRole) };
}

function collectKnownRoles(lines: MontageLine[]): Set<string> {
  const roles = new Set<string>();
  for (const line of lines) {
    const m = line.text.match(ROLE_TAG);
    if (m) roles.add(normalizeRole(m[1]));
  }
  return roles;
}

export function parseMontage(lines: MontageLine[]): MontageCast {
  const knownRoles = collectKnownRoles(lines);
  const actors: MontageActor[] = [];
  const seenActor = new Set<string>();
  const coloredRoles = new Set<string>();
  const coloredTimes = new Set<string>();

  let currentClock = "";
  let blockColored = false;

  const flushClock = () => {
    if (currentClock && blockColored) coloredTimes.add(currentClock);
    blockColored = false;
  };

  for (const line of lines) {
    const clockMatch = line.text.match(CLOCK);
    const isClockLine = clockMatch && /^(\d{1,2}:\d{2}:\d{2})$/.test(line.text.trim());
    if (isClockLine && clockMatch) {
      flushClock();
      currentClock = normalizeClock(clockMatch[1]);
      continue;
    }

    const tag = line.text.match(ROLE_TAG);
    if (tag) {
      const role = normalizeRole(tag[1]);
      if (line.colored) {
        coloredRoles.add(role);
        if (currentClock) blockColored = true;
      }
      continue;
    }

    const actor = parseActorLine(line.text, knownRoles.size ? knownRoles : undefined);
    if (actor) {
      const key = actor.name.toUpperCase();
      if (!seenActor.has(key)) {
        seenActor.add(key);
        actors.push(actor);
      }
      continue;
    }

    if (currentClock && line.colored) blockColored = true;
  }
  flushClock();

  const roleToActors = new Map<string, string[]>();
  for (const actor of actors) {
    for (const role of actor.roles) {
      const list = roleToActors.get(role) ?? [];
      if (!list.includes(actor.name)) list.push(actor.name);
      roleToActors.set(role, list);
    }
  }

  return { actors, roleToActors, coloredRoles, coloredTimes };
}

export function looksLikeMontage(text: string): boolean {
  const lines = montageLinesFromPlainText(text);
  return parseMontage(lines).actors.length > 0;
}

export function formatActorPrefix(
  roleRaw: string,
  _startRaw: string,
  cast: MontageCast,
): string {
  const role = normalizeRole(roleRaw);
  if (!role) return "";
  const names = cast.roleToActors.get(role);
  if (!names || names.length === 0) return "";
  return names.join(". ");
}

export function prefixCueWithActors(
  body: string,
  roleRaw: string,
  startRaw: string,
  cast: MontageCast | null | undefined,
  separator = ". ",
): string {
  if (!cast) return body;
  const prefix = formatActorPrefix(roleRaw, startRaw, cast);
  if (!prefix) return body;
  if (!body.trim()) return prefix;
  return `${prefix}${separator}${body}`;
}

export function parseDocxMontageXml(xml: string): MontageLine[] {
  const paras = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  const lines: MontageLine[] = [];
  for (const p of paras) {
    const pPr = (p.match(/<w:pPr[\s>][\s\S]*?<\/w:pPr>/) || [""])[0];
    const pColored = isWordColored(pPr);
    const runs = p.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) ?? [];
    let text = "";
    let runColored = false;
    for (const r of runs) {
      const chunk = [...r.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((m) => decodeXmlEntities(m[1]))
        .join("");
      if (!chunk) continue;
      text += chunk;
      if (isWordColored(r)) runColored = true;
    }
    if (!text.trim() && !runs.length) {
      const fallback = [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((m) => decodeXmlEntities(m[1]))
        .join("");
      text = fallback;
    }
    const line = text.replace(/\s+/g, " ").trim();
    if (!line) continue;
    lines.push({ text: line, colored: pColored || runColored });
  }
  return lines;
}

const HIGHLIGHT_NONE = new Set(["none", "nil", "null"]);
const FILL_NONE = new Set(["auto", "clear", "null", "ffffff", "ffffff00"]);

function isWordColored(fragment: string): boolean {
  const hl = fragment.match(/<w:highlight\b[^>]*w:val="([^"]+)"/i);
  if (hl && !HIGHLIGHT_NONE.has(hl[1].toLowerCase())) return true;
  const shd = fragment.match(/<w:shd\b[^>]*w:fill="([^"]+)"/i);
  if (shd && !FILL_NONE.has(shd[1].toLowerCase())) return true;
  return false;
}
