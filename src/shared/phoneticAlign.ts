/**
 * Выравнивание алфавита/палитры по звучанию к базовым RU-ключам.
 * Нет совпадения → пустое поле (ожидает ручного заполнения).
 */
import type { LayoutRule } from "./types";
import { makeRule, withRuleIds } from "./ruleIds";

/** Базовый ряд: русская буква → латинская фонетика. */
export const RU_PHONETIC_BASE: Array<{ from: string; latin: string }> = [
  { from: "а", latin: "a" },
  { from: "б", latin: "b" },
  { from: "в", latin: "v" },
  { from: "г", latin: "g" },
  { from: "д", latin: "d" },
  { from: "е", latin: "e" },
  { from: "ё", latin: "yo" },
  { from: "ж", latin: "zh" },
  { from: "з", latin: "z" },
  { from: "и", latin: "i" },
  { from: "й", latin: "j" },
  { from: "к", latin: "k" },
  { from: "л", latin: "l" },
  { from: "м", latin: "m" },
  { from: "н", latin: "n" },
  { from: "о", latin: "o" },
  { from: "п", latin: "p" },
  { from: "р", latin: "r" },
  { from: "с", latin: "s" },
  { from: "т", latin: "t" },
  { from: "у", latin: "u" },
  { from: "ф", latin: "f" },
  { from: "х", latin: "h" },
  { from: "ц", latin: "c" },
  { from: "ч", latin: "ch" },
  { from: "ш", latin: "sh" },
  { from: "щ", latin: "shch" },
  { from: "ъ", latin: "" },
  { from: "ы", latin: "y" },
  { from: "ь", latin: "" },
  { from: "э", latin: "e" },
  { from: "ю", latin: "yu" },
  { from: "я", latin: "ya" },
];

/** Доп. латинские/диакритические варианты → тот же RU-ключ. */
const LATIN_ALIASES: Record<string, string[]> = {
  a: ["a", "á", "à", "â", "ã", "ä", "å", "ā", "ă", "ą", "æ"],
  b: ["b"],
  v: ["v", "w"],
  g: ["g", "ğ", "ģ"],
  d: ["d", "ď", "đ", "ð"],
  e: ["e", "é", "è", "ê", "ë", "ē", "ė", "ę", "ě", "ə"],
  yo: ["yo", "ë", "ö"],
  zh: ["zh", "ž", "ż", "ź", "ǯ"],
  z: ["z", "ž"],
  i: ["i", "í", "ì", "î", "ï", "ī", "į", "ı"],
  j: ["j", "y", "ý"],
  k: ["k", "ķ", "ḳ"],
  l: ["l", "ł", "ļ", "ľ"],
  m: ["m"],
  n: ["n", "ń", "ň", "ņ", "ñ", "ŋ"],
  o: ["o", "ó", "ò", "ô", "õ", "ö", "ō", "ő", "ø"],
  p: ["p"],
  r: ["r", "ř", "ŕ"],
  s: ["s", "ś", "š", "ş", "ș", "ß"],
  t: ["t", "ť", "ț", "ţ"],
  u: ["u", "ú", "ù", "û", "ü", "ū", "ů", "ű"],
  f: ["f", "ph"],
  h: ["h", "x", "kh", "ḥ"],
  c: ["c", "ć", "č", "ç", "ц", "ts"],
  ch: ["ch", "č", "ć"],
  sh: ["sh", "š", "ș", "ş"],
  shch: ["shch", "sch", "ŝ", "щ"],
  y: ["y", "ý", "ÿ", "ı"],
  yu: ["yu", "iu", "ü"],
  ya: ["ya", "ia", "ja"],
};

function upperTarget(to: string): string {
  if (!to) return to;
  if (/[\u2C00-\u2C5F]/.test(to)) {
    return [...to]
      .map((ch) => {
        const cp = ch.codePointAt(0)!;
        if (cp >= 0x2c30 && cp <= 0x2c5f) return String.fromCodePoint(cp - 0x30);
        return ch;
      })
      .join("");
  }
  if (/[\u0530-\u058F]/.test(to)) return to.toLocaleUpperCase("hy-AM");
  return to.toLocaleUpperCase("en-US");
}

function normKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US");
}

function buildLatinToRu(): Map<string, string> {
  const map = new Map<string, string>();
  for (const { from, latin } of RU_PHONETIC_BASE) {
    if (!latin) continue;
    map.set(normKey(latin), from);
    const aliases = LATIN_ALIASES[latin] ?? [latin];
    for (const a of aliases) map.set(normKey(a), from);
  }
  // прямые кириллические
  for (const { from } of RU_PHONETIC_BASE) {
    map.set(normKey(from), from);
  }
  return map;
}

const LATIN_TO_RU = buildLatinToRu();

function isLowerCyrSource(from: string): boolean {
  return from === from.toLocaleLowerCase("ru-RU") && /[а-яё]/i.test(from);
}

/**
 * Собирает правила: базовый RU-ряд + явная карта алфавита + фонетика.
 * Лишние символы палитры → строки с пустым from.
 * Нет совпадения → to (или from) пустой.
 */
export function alignAlphabetToLayout(
  symbols: string[],
  explicitRules: LayoutRule[] | null | undefined,
): LayoutRule[] {
  const explicit = explicitRules ?? [];
  const fromTo = new Map<string, string>();
  for (const r of explicit) {
    if (!fromTo.has(r.from)) fromTo.set(r.from, r.to);
  }

  // to → from из явной карты (для обратного поиска)
  const toFrom = new Map<string, string>();
  for (const r of explicit) {
    if (r.to && !toFrom.has(r.to)) toFrom.set(r.to, r.from);
  }

  const uniqueSymbols = [...new Set(symbols.filter(Boolean))];
  const usedTo = new Set<string>();
  const out: LayoutRule[] = [];

  const pickToForFrom = (from: string, latin: string): string => {
    const direct = fromTo.get(from);
    if (direct !== undefined) {
      // пустая строка в карте = осознанно пусто
      return direct;
    }
    // фонетика по латинскому ключу среди символов
    const want = new Set(
      (LATIN_ALIASES[latin] ?? (latin ? [latin] : [])).map(normKey),
    );
    want.add(normKey(from));
    for (const sym of uniqueSymbols) {
      if (usedTo.has(sym)) continue;
      const n = normKey(sym);
      if (want.has(n) || LATIN_TO_RU.get(n) === from) {
        return sym;
      }
    }
    // символ, который карта уже связала с этим from
    for (const [to, f] of toFrom) {
      if (f === from && !usedTo.has(to)) return to;
    }
    return "";
  };

  for (const { from, latin } of RU_PHONETIC_BASE) {
    const to = pickToForFrom(from, latin);
    if (to) usedTo.add(to);
    out.push(makeRule(from, to));

    const From = from.toLocaleUpperCase("ru-RU");
    if (From !== from) {
      const mappedUpper = fromTo.get(From);
      const To =
        mappedUpper !== undefined
          ? mappedUpper
          : to
            ? upperTarget(to)
            : "";
      if (To) usedTo.add(To);
      out.push(makeRule(From, To));
    }
  }

  // доп. ключи из карты (гъ, дз…), которых нет в базе
  const baseFrom = new Set(out.map((r) => r.from));
  for (const r of explicit) {
    if (baseFrom.has(r.from)) continue;
    if (!isLowerCyrSource(r.from) && r.from !== r.from.toLocaleLowerCase("ru-RU")) {
      // uppercase extras already handled via withCase usually
    }
    out.push(makeRule(r.from, r.to));
    baseFrom.add(r.from);
    if (r.to) usedTo.add(r.to);
  }

  // лишние символы палитры без пары
  for (const sym of uniqueSymbols) {
    if (usedTo.has(sym)) continue;
    // уже есть как to в out
    if (out.some((r) => r.to === sym)) continue;
    const guessedFrom = LATIN_TO_RU.get(normKey(sym)) ?? toFrom.get(sym) ?? "";
    // если угадали from, но эта строка уже занята другим to — оставим пустой from
    const taken = guessedFrom && out.some((r) => r.from === guessedFrom && r.to);
    out.push(makeRule(taken ? "" : guessedFrom, sym));
    usedTo.add(sym);
  }

  return withRuleIds(out);
}

/** Подобрать from для одного символа (клик по палитре при пустых правилах). */
export function phoneticFromForSymbol(
  symbol: string,
  explicitRules: LayoutRule[] | null | undefined,
): string {
  if (explicitRules) {
    const hit = explicitRules.find((r) => r.to === symbol);
    if (hit) return hit.from;
  }
  return LATIN_TO_RU.get(normKey(symbol)) ?? "";
}
