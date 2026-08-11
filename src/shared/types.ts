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

export type { HotkeysConfig } from "./hotkeys";

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
};

export type RuleConflict = {
  symbol: string;
  fromOptions: string[];
};
