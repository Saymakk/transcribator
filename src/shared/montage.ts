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
  const t = s.trim().replace(/\s+/g, " ");
  if (!t || t.length > 48) return false;
  if (/[.,!?;:]/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  const words = t.split(" ");
  if (words.length > 6) return false;
  return words.every((word) => /^[\p{L}\p{N}]+$/u.test(word));
}

/** "Фёдоров (Новиков 03.10.2026)" → "Фёдоров" */
function stripActorNote(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

/** One surname, or "Фамилия Имя". Notes in parentheses are removed. */
function actorNameWords(name: string): string[] {
  const t = stripActorNote(name);
  if (!t || t.length > 80) return [];
  if (ROLE_TAG.test(t) || /\d/.test(t) || /[.!?]/.test(t) || /\d{1,2}:\d{2}/.test(t)) return [];
  const words = t.split(" ");
  if (words.length > 3) return [];
  if (!words.every((word) => /^\p{L}[\p{L}'’\-]*$/u.test(word))) return [];
  return words;
}

/**
 * A cast row sometimes merges several actors:
 * "ДУЖЕНКОВА: СТАРУШКА, МИА, КОРШ: ПАЙПЕР, ДЖАРЕД,"
 * Split before each later "SURNAME:" that follows a comma.
 */
export function splitGluedActorLine(text: string): string[] {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw.includes(":")) return [raw];
  return raw
    .split(/,\s+(?=[\p{Lu}][\p{L}\p{N}'’\-]*(?:\s+[\p{Lu}][\p{L}\p{N}'’\-]*){0,3}\s*:)/u)
    .map((part) => part.trim())
    .filter(Boolean);
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
  const nameWords = actorNameWords(actor);
  if (nameWords.length === 0 || !roleParts.every(isRoleToken)) return null;
  const name = nameWords.join(" ");
  // "Иванова Юля, РОЛЬ, РОЛЬ" is a cast row. "РОБ УИЛСОН, ДЕТЕКТИВ" is a lower third.
  if (nameWords.length > 1 && roleParts.length < 2) return null;
  if (knownRoles && knownRoles.size > 0) {
    if (knownRoles.has(normalizeRole(name))) return null;
    const hits = roleParts.filter((r) => knownRoles.has(normalizeRole(r))).length;
    const need = nameWords.length > 1 ? 2 : 1;
    if (hits < need) return null;
  }
  return { name, roles: roleParts.map(normalizeRole) };
}

function collectKnownRoles(lines: MontageLine[]): Set<string> {
  const roles = new Set<string>();
  for (const line of lines) {
    const m = line.text.match(ROLE_TAG);
    if (m) roles.add(normalizeRole(m[1]));
  }
  return roles;
}

function isClockLine(text: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(text.trim());
}

/** Cast header ends at the first cue clock: `00:00` or `0:01:13`. */
function isTimecodeLine(text: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text.trim());
}

/** First line of a montage, when it is not a role, clock, or cast row. */
function leadingTitle(lines: MontageLine[]): string {
  const first = lines[0]?.text.trim() ?? "";
  if (!first) return "";
  if (ROLE_TAG.test(first) || isClockLine(first)) return "";
  if (isTimecodeLine(first)) return "";
  if (splitGluedActorLine(first).some((part) => parseActorLine(part) !== null)) return "";
  return first;
}

export function parseMontage(lines: MontageLine[]): MontageCast {
  const knownRoles = collectKnownRoles(lines);
  const title = leadingTitle(lines);
  const titleKey = title ? normalizeRole(title) : "";
  const actors: MontageActor[] = [];
  const seenActor = new Set<string>();
  const coloredRoles = new Set<string>();
  const coloredTimes = new Set<string>();

  let currentClock = "";
  let blockColored = false;
  let passedPreamble = false;
  let castClosed = false;

  const flushClock = () => {
    if (currentClock && blockColored) coloredTimes.add(currentClock);
    blockColored = false;
  };

  for (const line of lines) {
    const clockMatch = line.text.match(CLOCK);
    const clockOnly = clockMatch && isClockLine(line.text);
    if (!castClosed && isTimecodeLine(line.text)) castClosed = true;
    const actorParts = castClosed ? [] : splitGluedActorLine(line.text);
    const parsedActors = actorParts
      .map((part) => parseActorLine(part, knownRoles.size ? knownRoles : undefined))
      .filter((actor): actor is MontageActor => actor !== null);

    if (!passedPreamble) {
      const structural =
        Boolean(line.text.match(ROLE_TAG)) ||
        Boolean(clockOnly) ||
        isTimecodeLine(line.text) ||
        parsedActors.length > 0;
      if (!structural) continue;
      passedPreamble = true;
    }

    if (clockOnly && clockMatch) {
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

    if (parsedActors.length > 0) {
      for (const actor of parsedActors) {
        if (title && actor.name.localeCompare(title, undefined, { sensitivity: "accent" }) === 0) {
          continue;
        }
        const key = actor.name.toUpperCase();
        if (!seenActor.has(key)) {
          seenActor.add(key);
          actors.push({
            ...actor,
            roles: titleKey ? actor.roles.filter((role) => role !== titleKey) : actor.roles,
          });
        }
      }
      continue;
    }

    if (currentClock && line.colored) blockColored = true;
  }
  flushClock();

  const roleToActors = new Map<string, string[]>();
  for (const actor of actors) {
    for (const role of actor.roles) {
      if (titleKey && role === titleKey) continue;
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
