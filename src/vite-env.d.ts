/// <reference types="vite/client" />

import type {
  AppState,
  HotkeysConfig,
  Layout,
  PuntoDictEntry,
  PuntoMode,
  PuntoPairId,
  TranslitMode,
} from "./shared/types";

type MontageLine = { text: string; colored?: boolean };

export type OpenFileResult =
  | { ok: true; name: string; text: string; montageLines?: MontageLine[] }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type OpenFilesResult =
  | { ok: true; items: Array<{ name: string; text: string; montageLines?: MontageLine[] }> }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type ExtractResult =
  | { ok: true; text: string; montageLines?: MontageLine[] }
  | { ok: false; error: string };

export type SaveFileResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type TranscribatorApi = {
  getState: () => Promise<AppState>;
  setActiveLayout: (id: string) => Promise<AppState>;
  setMode: (mode: TranslitMode) => Promise<AppState>;
  toggleMode: (target: "forward" | "reverse") => Promise<AppState>;
  setPuntoMode: (mode: PuntoMode) => Promise<AppState>;
  togglePuntoMode: (target: "a2b" | "b2a" | "auto") => Promise<AppState>;
  setPuntoPairId: (id: PuntoPairId) => Promise<AppState>;
  setPuntoDictionary: (entries: PuntoDictEntry[]) => Promise<AppState>;
  setLaunchAtLogin: (enabled: boolean) => Promise<AppState>;
  setHotkeys: (hotkeys: HotkeysConfig) => Promise<AppState>;
  setAssSrtPrefs: (prefs: import("./shared/types").AssSrtPrefs) => Promise<AppState>;
  setUpdatePrefs: (prefs: import("./shared/types").UpdatePrefs) => Promise<AppState>;
  setLocale: (locale: import("./shared/types").LocaleId) => Promise<AppState>;
  setCustomPalettes: (
    palettes: import("./shared/types").CustomPalette[],
  ) => Promise<AppState>;
  upsertCustomPalette: (
    palette: import("./shared/types").CustomPalette,
  ) => Promise<AppState>;
  deleteCustomPalette: (id: string) => Promise<AppState>;
  saveLayout: (layout: Layout) => Promise<AppState>;
  createLayout: (name: string) => Promise<AppState>;
  cloneLayout: (id: string) => Promise<AppState>;
  deleteLayout: (id: string) => Promise<AppState>;
  renameLayout: (id: string, name: string) => Promise<AppState>;
  openAccessibilitySettings: () => Promise<void>;
  openDocument: () => Promise<OpenFileResult>;
  openDocuments: () => Promise<OpenFilesResult>;
  openTextOrPdf: () => Promise<OpenFileResult>;
  extractDocument: (name: string, bytes: ArrayBuffer) => Promise<ExtractResult>;
  saveText: (suggestedName: string, content: string) => Promise<SaveFileResult>;
  openExternal: (url: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  getAppVersion: () => Promise<string>;
  getUpdateStatus: () => Promise<import("./components/UpdatePanel").UpdateStatus>;
  checkForUpdates: () => Promise<unknown>;
  downloadAndInstallUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onStateChanged: (cb: (state: AppState) => void) => () => void;
  onNavigate: (cb: (section: string) => void) => () => void;
  onUpdateStatus: (
    cb: (status: import("./components/UpdatePanel").UpdateStatus) => void,
  ) => () => void;
};

declare global {
  interface Window {
    transcribator: TranscribatorApi;
  }
}

export {};
