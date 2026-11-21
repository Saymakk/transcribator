export type LayoutRule = {
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

export type LocaleId =
  | "en"
  | "ru"
  | "uk"
  | "de"
  | "fr"
  | "es"
  | "pl"
  | "zh"
  | "ko"
  | "ar";

export type CustomPalette = {
  id: string;
  name: string;
  symbols: string[];
};

export type AssFieldCase = "as-is" | "upper" | "lower";

export type AssSrtFormat = {
  fields: string[];
  separator: string;
  keepEmpty: boolean;
  fieldWrappers: Record<string, string>;
  actorWrapper: string;
  actorSeparator: string | null;
  fieldCases: Record<string, AssFieldCase>;
  actorCase: AssFieldCase;
  omitEmptyWrapped: boolean;
  skipCuesWithoutActor: boolean;
};

export type AssSrtProfile = AssSrtFormat & {
  id: string;
  name: string;
};

export type AssSrtPrefs = AssSrtFormat & {
  profiles: AssSrtProfile[];
};

export type UpdateProviderId = "github" | "generic";

export type UpdatePrefs = {
  provider: UpdateProviderId;
  url: string;
};

export type HotkeysConfig = {
  chordFirst: string;
  chordSecond: string;
  undoDoubleCtrlMs: number;
  undoEnabled: boolean;
};

export type AppState = {
  layouts: Layout[];
  activeLayoutId: string;
  mode: TranslitMode;
  customPalettes: CustomPalette[];
  launchAtLogin: boolean;
  hookActive: boolean;
  locale: LocaleId;
  hotkeys: HotkeysConfig;
  assSrtPrefs: AssSrtPrefs;
  updatePrefs: UpdatePrefs;
};

export type RuleConflict = {
  symbol: string;
  fromOptions: string[];
};
