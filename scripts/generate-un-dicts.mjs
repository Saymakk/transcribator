/**
 * Собирает словари языков ООН из частотных списков.
 * RU/EN/FR/ES — пары раскладки QWERTY↔ЙЦУКЕН.
 * AR/ZH — топ-слова + простая латинизация (для ручного поиска/замен).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LISTS = path.join(__dirname, "wordlists");
const OUT_SRC = path.join(ROOT, "src", "shared", "dicts");
const OUT_EL = path.join(ROOT, "electron", "data");

const EN =
  "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?`~@#$%^&";
const RU =
  "йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,ёЁ\"№;%:?";

function buildMap(a, b) {
  const m = new Map();
  for (let i = 0; i < Math.min(a.length, b.length); i++) m.set(a[i], b[i]);
  return m;
}
const EN_TO_RU = buildMap(EN, RU);
const RU_TO_EN = buildMap(RU, EN);

function layoutConvert(text, direction) {
  const map = direction === "en2ru" ? EN_TO_RU : RU_TO_EN;
  let out = "";
  for (const ch of text) out += map.get(ch) ?? ch;
  return out;
}

function readFreqWords(file, max, testFn) {
  const raw = fs.readFileSync(file, "utf8");
  const words = [];
  const seen = new Set();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const word = line.split(/\s+/)[0];
    if (!word || seen.has(word)) continue;
    if (testFn && !testFn(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= max) break;
  }
  return words;
}

/** Баковая романизация арабского (упрощённо). */
const AR_ROM = {
  "\u0627": "a",
  "\u0623": "a",
  "\u0625": "i",
  "\u0622": "aa",
  "\u0628": "b",
  "\u062A": "t",
  "\u062B": "th",
  "\u062C": "j",
  "\u062D": "h",
  "\u062E": "kh",
  "\u062F": "d",
  "\u0630": "dh",
  "\u0631": "r",
  "\u0632": "z",
  "\u0633": "s",
  "\u0634": "sh",
  "\u0635": "s",
  "\u0636": "d",
  "\u0637": "t",
  "\u0638": "z",
  "\u0639": "a",
  "\u063A": "gh",
  "\u0641": "f",
  "\u0642": "q",
  "\u0643": "k",
  "\u0644": "l",
  "\u0645": "m",
  "\u0646": "n",
  "\u0647": "h",
  "\u0648": "w",
  "\u064A": "y",
  "\u0649": "a",
  "\u0629": "a",
  "\u0621": "",
  "\u0626": "y",
  "\u0624": "w",
  "\u064E": "a",
  "\u064F": "u",
  "\u0650": "i",
  "\u064B": "an",
  "\u064C": "un",
  "\u064D": "in",
  "\u0652": "",
  "\u0651": "",
};
function arabicToLatin(word) {
  let out = "";
  for (const ch of word) out += AR_ROM[ch] ?? (/[\u0600-\u06FF]/.test(ch) ? "" : ch);
  return out.replace(/'+/g, "").replace(/\s+/g, "") || word;
}

/** Упрощённый pinyin-like для частых китайских слогов — по символу через fallback hex skip; берём только слова с латиницей из списка если есть. */
function isCjk(word) {
  return /[\u4e00-\u9fff]/.test(word);
}

function addPair(map, from, to) {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t || f === t) return;
  const key = f.toLocaleLowerCase("en-US");
  // не перезаписываем более короткий ключ более длинным конфликтом зря — первый (частотный) важнее
  if (!map.has(key)) map.set(key, { from: f, to: t });
}

function buildLatinKeyboardPack(id, name, language, words, limit) {
  const map = new Map();
  let n = 0;
  for (const word of words) {
    if (n >= limit) break;
    // набрали на RU-раскладке вместо Latin → восстановить слово
    const mistypedOnRu = layoutConvert(word, "en2ru");
    addPair(map, mistypedOnRu, word);
    // слово → что будет, если набрать его же на EN, думая что RU (обратный справочник)
    // для Latin-пакетов основной кейс — первый
    n += 1;
  }
  return {
    id,
    name,
    language,
    un: true,
    entries: [...map.values()],
  };
}

function buildRussianPack(words, limit) {
  const map = new Map();
  let n = 0;
  for (const word of words) {
    if (n >= limit) break;
    const mistype = layoutConvert(word, "ru2en");
    addPair(map, mistype, word);
    // обратное: кириллический «мусор» при наборе латиницы
    const reverse = layoutConvert(mistype, "en2ru");
    if (reverse === word) {
      // already covered
    }
    n += 1;
  }
  // также EN-слова не здесь
  return {
    id: "ru",
    name: "Русский (ООН) — Punto QWERTY↔ЙЦУКЕН",
    language: "ru",
    un: true,
    entries: [...map.values()],
  };
}

function buildArabicPack(words, limit) {
  const map = new Map();
  let n = 0;
  for (const word of words) {
    if (n >= limit) break;
    const lat = arabicToLatin(word);
    if (lat && lat !== word) {
      addPair(map, lat, word);
      addPair(map, word, lat);
    }
    n += 1;
  }
  return {
    id: "ar",
    name: "العربية (ООН) — латиница ↔ арабский",
    language: "ar",
    un: true,
    entries: [...map.values()],
  };
}

function buildChinesePack(words, limit) {
  let pinyinFn = null;
  try {
    pinyinFn = require("pinyin-pro").pinyin;
  } catch {
    console.warn("pinyin-pro not available, Chinese pack will be sparse");
  }
  const map = new Map();
  let n = 0;
  for (const word of words) {
    if (n >= limit) break;
    if (/^[a-zA-Z]+$/.test(word)) {
      const mistypedOnRu = layoutConvert(word.toLowerCase(), "en2ru");
      addPair(map, mistypedOnRu, word.toLowerCase());
    } else if (isCjk(word) && pinyinFn) {
      const py = pinyinFn(word, { toneType: "none", type: "array" }).join("");
      if (py && py !== word) {
        addPair(map, py, word);
        addPair(map, word, py);
        // также mistype pinyin на русской раскладке
        addPair(map, layoutConvert(py, "en2ru"), word);
      }
    }
    n += 1;
  }
  return {
    id: "zh",
    name: "中文 (ООН) — pinyin ↔ 汉字",
    language: "zh",
    un: true,
    entries: [...map.values()],
  };
}

const PER_LANG = 20000;

const ruWords = readFreqWords(
  path.join(LISTS, "ru.txt"),
  PER_LANG,
  (w) => /^[а-яёА-ЯЁ\-']+$/u.test(w) && w.length >= 2,
);
const enWords = readFreqWords(
  path.join(LISTS, "en.txt"),
  PER_LANG,
  (w) => /^[a-zA-Z\-']+$/.test(w) && w.length >= 2,
);
const frWords = readFreqWords(
  path.join(LISTS, "fr.txt"),
  PER_LANG,
  (w) => /^[a-zA-ZàâäæçéèêëïîôùûüÿœÀÂÄÆÇÉÈÊËÏÎÔÙÛÜŸŒ\-']+$/u.test(w) && w.length >= 2,
);
const esWords = readFreqWords(
  path.join(LISTS, "es.txt"),
  PER_LANG,
  (w) => /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\-']+$/u.test(w) && w.length >= 2,
);
const arWords = readFreqWords(
  path.join(LISTS, "ar.txt"),
  PER_LANG,
  (w) => /[\u0600-\u06FF]/.test(w) && w.length >= 2,
);
const zhWords = readFreqWords(
  path.join(LISTS, "zh.txt"),
  PER_LANG,
  (w) => w.length >= 1,
);

const packs = [
  buildRussianPack(ruWords, PER_LANG),
  buildLatinKeyboardPack("en", "English (UN) — RU-layout mistype → EN", "en", enWords, PER_LANG),
  buildLatinKeyboardPack("fr", "Français (ONU) — RU-layout mistype → FR", "fr", frWords, PER_LANG),
  buildLatinKeyboardPack("es", "Español (ONU) — RU-layout mistype → ES", "es", esWords, PER_LANG),
  buildArabicPack(arWords, PER_LANG),
  buildChinesePack(zhWords, Math.min(PER_LANG, 15000)),
];

// Индекс пакетов (без огромного un-all — пакеты мержатся при загрузке)
const index = packs.map((p) => ({
  id: p.id,
  name: p.name,
  language: p.language,
  count: p.entries.length,
}));

fs.mkdirSync(OUT_SRC, { recursive: true });
fs.mkdirSync(OUT_EL, { recursive: true });

for (const pack of packs) {
  const file = `${pack.id}.json`;
  fs.writeFileSync(path.join(OUT_SRC, file), JSON.stringify(pack), "utf8");
  fs.writeFileSync(path.join(OUT_EL, file), JSON.stringify(pack), "utf8");
  console.log(`${pack.id}: ${pack.entries.length} entries`);
}

fs.writeFileSync(path.join(OUT_SRC, "index.json"), JSON.stringify(index, null, 2), "utf8");
fs.writeFileSync(path.join(OUT_EL, "index.json"), JSON.stringify(index, null, 2), "utf8");

const total = packs.reduce((s, p) => s + p.entries.length, 0);
console.log(`total entries across packs: ${total}`);
console.log("done");
