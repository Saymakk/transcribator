import type { PuntoDictEntry } from "./types";

export type PuntoPairId = "ru-en" | "ru-fr" | "ru-es" | "ar-lat" | "zh-py";

/** Как обрабатывать слово при конвертации. */
export type PuntoEngine = "layout" | "dict";

export type PuntoPair = {
  id: PuntoPairId;
  /** Русский ↔ English */
  label: string;
  /** RU–EN */
  short: string;
  /** Пакеты словарей для этой пары */
  packIds: string[];
  /** layout = QWERTY↔ЙЦУКЕН; dict = в основном словарь */
  engine: PuntoEngine;
  a2b: {
    /** EN → RU */
    label: string;
    /** Подсказка */
    hint: string;
    /** Для layout-engine: направление раскладки */
    layoutDir: "en2ru" | "ru2en";
  };
  b2a: {
    label: string;
    hint: string;
    layoutDir: "en2ru" | "ru2en";
  };
};

export const PUNTO_PAIRS: PuntoPair[] = [
  {
    id: "ru-en",
    label: "Русский ↔ English",
    short: "RU–EN",
    packIds: ["ru", "en"],
    engine: "layout",
    a2b: {
      label: "EN → RU",
      hint: "Печатали на английской раскладке вместо русской",
      layoutDir: "en2ru",
    },
    b2a: {
      label: "RU → EN",
      hint: "Печатали на русской раскладке вместо английской",
      layoutDir: "ru2en",
    },
  },
  {
    id: "ru-fr",
    label: "Русский ↔ Français",
    short: "RU–FR",
    packIds: ["ru", "fr"],
    engine: "layout",
    a2b: {
      label: "FR → RU",
      hint: "Латиница (как FR) набрана вместо русской",
      layoutDir: "en2ru",
    },
    b2a: {
      label: "RU → FR",
      hint: "Русская раскладка вместо французской латиницы",
      layoutDir: "ru2en",
    },
  },
  {
    id: "ru-es",
    label: "Русский ↔ Español",
    short: "RU–ES",
    packIds: ["ru", "es"],
    engine: "layout",
    a2b: {
      label: "ES → RU",
      hint: "Латиница (как ES) набрана вместо русской",
      layoutDir: "en2ru",
    },
    b2a: {
      label: "RU → ES",
      hint: "Русская раскладка вместо испанской латиницы",
      layoutDir: "ru2en",
    },
  },
  {
    id: "ar-lat",
    label: "العربية ↔ латиница",
    short: "AR–LAT",
    packIds: ["ar"],
    engine: "dict",
    a2b: {
      label: "LAT → AR",
      hint: "Латинская транслитерация → арабский",
      layoutDir: "en2ru",
    },
    b2a: {
      label: "AR → LAT",
      hint: "Арабский → латиница",
      layoutDir: "ru2en",
    },
  },
  {
    id: "zh-py",
    label: "中文 ↔ Pinyin",
    short: "ZH–PY",
    packIds: ["zh"],
    engine: "dict",
    a2b: {
      label: "PY → 汉字",
      hint: "Pinyin → иероглифы",
      layoutDir: "en2ru",
    },
    b2a: {
      label: "汉字 → PY",
      hint: "Иероглифы → pinyin",
      layoutDir: "ru2en",
    },
  },
];

export const DEFAULT_PUNTO_PAIR: PuntoPairId = "ru-en";

export function getPuntoPair(id: string | undefined): PuntoPair {
  return PUNTO_PAIRS.find((p) => p.id === id) ?? PUNTO_PAIRS[0];
}

export function isPuntoPairId(id: unknown): id is PuntoPairId {
  return typeof id === "string" && PUNTO_PAIRS.some((p) => p.id === id);
}

export function pairPackIds(pairId: PuntoPairId): string[] {
  return getPuntoPair(pairId).packIds;
}

export type { PuntoDictEntry };
