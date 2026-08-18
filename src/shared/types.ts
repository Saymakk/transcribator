import type { UpdatePrefs } from "./updateFeed";

export type LayoutRule = {
  /** Stable row id for React lists (optional for older saved layouts). */
  id?: string;
  from: string;
  to: string;
};

export type Layout = {
  id: string;
  name: string;
  rules: LayoutRule[];
};

export type TranslitMode = "off" | "forward" | "reverse";

export type PuntoMode = "off" | "a2b" | "b2a" | "auto";

export type PuntoPairId = "ru-en" | "ru-fr" | "ru-es" | "ar-lat" | "zh-py";

export type PuntoDictEntry = {
  from: string;
  to: string;
};

export type CustomPalette = {
  id: string;
  name: string;
  symbols: string[];
};

export type AssSrtPrefs = {
  /** Preferred field names in cue order (matched case-insensitively to Format:). */
  fields: string[];
  separator: string;
  keepEmpty: boolean;
};

export const DEFAULT_ASS_SRT_PREFS: AssSrtPrefs = {
  fields: ["Text"],
  separator: ". ",
  keepEmpty: false,
};

export type { HotkeysConfig } from "./hotkeys";
export type { UpdatePrefs, UpdateProviderId } from "./updateFeed";

export type AppState = {
  layouts: Layout[];
  activeLayoutId: string;
  mode: TranslitMode;
  puntoMode: PuntoMode;
  /** Активная языковая пара Punto (по умолчанию RU–EN). */
  puntoPairId: PuntoPairId;
  /** Пользовательские пары (перекрывают пакет выбранной пары). */
  puntoDictionary: PuntoDictEntry[];
  /** User-defined symbol palettes. */
  customPalettes: CustomPalette[];
  launchAtLogin: boolean;
  hookActive: boolean;
  /** UI language. */
  locale: import("./i18n").LocaleId;
  /** Global hotkeys (chords + undo). */
  hotkeys: import("./hotkeys").HotkeysConfig;
  /** ASS→SRT converter field order / separator prefs. */
  assSrtPrefs: AssSrtPrefs;
  /** Where to look for app updates. */
  updatePrefs: UpdatePrefs;
};

export type RuleConflict = {
  symbol: string;
  fromOptions: string[];
};
