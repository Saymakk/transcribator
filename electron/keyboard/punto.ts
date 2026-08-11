/** QWERTY ↔ ЙЦУКЕН (Punto) + словарь ручных замен + авто обе стороны. */

import type { PuntoDictEntry } from "../shared/types";

const EN =
  "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?`~@#$%^&";
const RU =
  "йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,ёЁ\"№;%:?";

function buildMap(from: string, to: string): Map<string, string> {
  const map = new Map<string, string>();
  const n = Math.min(from.length, to.length);
  for (let i = 0; i < n; i += 1) {
    map.set(from[i], to[i]);
  }
  return map;
}

const EN_TO_RU = buildMap(EN, RU);
const RU_TO_EN = buildMap(RU, EN);

export type PuntoDirection = "en2ru" | "ru2en";

function applyCase(source: string, mapped: string): string {
  if (!mapped) return mapped;
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return mapped.toLocaleUpperCase("ru-RU");
  }
  if (
    source[0] === source[0].toLocaleUpperCase("ru-RU") &&
    source !== source.toLocaleLowerCase("ru-RU")
  ) {
    return mapped.charAt(0).toLocaleUpperCase("ru-RU") + mapped.slice(1);
  }
  return mapped;
}

function lookupDict(word: string, dictionary: PuntoDictEntry[]): string | null {
  const key = word.toLocaleLowerCase("ru-RU");
  let best: PuntoDictEntry | null = null;
  for (const entry of dictionary) {
    const from = entry.from.trim();
    if (!from) continue;
    if (from.toLocaleLowerCase("ru-RU") !== key) continue;
    if (!best || from.length > best.from.length) best = entry;
  }
  return best ? applyCase(word, best.to) : null;
}

function isKnownCorrect(word: string, dictionary: PuntoDictEntry[]): boolean {
  const key = word.toLocaleLowerCase("ru-RU");
  for (const entry of dictionary) {
    if (entry.to.trim().toLocaleLowerCase("ru-RU") === key) return true;
  }
  return false;
}

export function layoutConvert(text: string, direction: PuntoDirection): string {
  const map = direction === "en2ru" ? EN_TO_RU : RU_TO_EN;
  let out = "";
  for (const ch of text) {
    out += map.get(ch) ?? ch;
  }
  return out;
}

export function puntoConvertWord(
  word: string,
  direction: PuntoDirection,
  dictionary: PuntoDictEntry[] = [],
  engine: "layout" | "dict" = "layout",
): string {
  const fromDict = lookupDict(word, dictionary);
  if (fromDict !== null) return fromDict;
  if (isKnownCorrect(word, dictionary)) return word;
  if (engine === "dict") {
    const switched = layoutConvert(word, direction);
    return lookupDict(switched, dictionary) ?? word;
  }
  const switched = layoutConvert(word, direction);
  if (isKnownCorrect(switched, dictionary)) return switched;
  const after = lookupDict(switched, dictionary);
  return after ?? switched;
}

/**
 * Обе стороны пары: по QWERTY- и ЙЦУКЕН-прочтениям одних и тех же клавиш.
 * Возвращает замену только при словарном попадании; иначе null (не трогать экран).
 */
export function puntoConvertWordAuto(
  qwertyWord: string,
  jcukenWord: string,
  dictionary: PuntoDictEntry[] = [],
  _engine: "layout" | "dict" = "layout",
): string | null {
  if (!qwertyWord && !jcukenWord) return null;

  // Прямой mistype → correct
  const fromQw = lookupDict(qwertyWord, dictionary);
  if (fromQw) return fromQw;
  const fromJu = lookupDict(jcukenWord, dictionary);
  if (fromJu) return fromJu;

  // Уже корректное слово — не меняем
  if (isKnownCorrect(qwertyWord, dictionary) || isKnownCorrect(jcukenWord, dictionary)) {
    return null;
  }

  // После смены раскладки получается известное слово
  const cyr = layoutConvert(qwertyWord, "en2ru");
  if (cyr !== qwertyWord) {
    if (isKnownCorrect(cyr, dictionary)) return cyr;
    const hit = lookupDict(cyr, dictionary);
    if (hit) return hit;
  }

  const lat = layoutConvert(jcukenWord, "ru2en");
  if (lat !== jcukenWord) {
    if (isKnownCorrect(lat, dictionary)) return lat;
    const hit = lookupDict(lat, dictionary);
    if (hit) return hit;
  }

  return null;
}

export function puntoConvert(
  text: string,
  direction: PuntoDirection,
  dictionary: PuntoDictEntry[] = [],
  engine: "layout" | "dict" = "layout",
): string {
  if (!text) return text;
  const parts = text.split(/(\s+)/);
  return parts
    .map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      return puntoConvertWord(part, direction, dictionary, engine);
    })
    .join("");
}

export function detectPuntoDirection(text: string): PuntoDirection {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (/[а-яёА-ЯЁ]/.test(ch)) cyr += 1;
    else if (/[a-zA-Z]/.test(ch)) lat += 1;
  }
  return cyr >= lat ? "ru2en" : "en2ru";
}
