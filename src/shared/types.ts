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

/** Case transform for a cue field or actor prefix. */
export type AssFieldCase = "as-is" | "upper" | "lower";

/** Formatting snapshot without saved profile list. */
export type AssSrtFormat = {
  /** Preferred field names in cue order (matched case-insensitively to Format:). */
  fields: string[];
  separator: string;
  keepEmpty: boolean;
  /**
   * Optional wrap around each field value, keyed by field name (case-insensitive).
   * Examples: "[]" → [Name], "{}" → {Actor}. Empty string = no wrap.
   */
  fieldWrappers: Record<string, string>;
  /** Wrap for montage actor names prepended before the cue. */
  actorWrapper: string;
  /**
   * Separator between actor prefix and the rest of the cue.
   * `null` means use the same value as `separator`.
   */
  actorSeparator: string | null;
  /** Case transform per ASS field name. */
  fieldCases: Record<string, AssFieldCase>;
  /** Case transform for montage actor names. */
  actorCase: AssFieldCase;
  /** Do not emit wrapped empties like `[]` when the value is blank. */
  omitEmptyWrapped: boolean;
  /** When a montage is attached, skip cues that have no matching actor. */
  skipCuesWithoutActor: boolean;
};

export type AssSrtProfile = AssSrtFormat & {
  id: string;
  name: string;
};

export type AssSrtPrefs = AssSrtFormat & {
  profiles: AssSrtProfile[];
};

export const DEFAULT_ASS_SRT_PREFS: AssSrtPrefs = {
  fields: ["Text"],
  separator: ". ",
  keepEmpty: false,
  fieldWrappers: {},
  actorWrapper: "",
  actorSeparator: null,
  fieldCases: {},
  actorCase: "as-is",
  omitEmptyWrapped: true,
  skipCuesWithoutActor: false,
  profiles: [],
};

export type { HotkeysConfig } from "./hotkeys";
export type { UpdatePrefs, UpdateProviderId } from "./updateFeed";
export type { LocaleId } from "./i18n";

export type RuleConflict = {
  symbol: string;
  fromOptions: string[];
};

export type AppState = {
  layouts: Layout[];
  activeLayoutId: string;
  mode: TranslitMode;
  /** User-defined symbol palettes. */
  customPalettes: CustomPalette[];
  launchAtLogin: boolean;
  hookActive: boolean;
  locale: import("./i18n").LocaleId;
  hotkeys: import("./hotkeys").HotkeysConfig;
  assSrtPrefs: AssSrtPrefs;
  updatePrefs: UpdatePrefs;
};
