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
  openVideos: () => Promise<
    | { ok: true; paths: string[] }
    | { ok: false; canceled: true }
    | { ok: false; canceled: false; error: string }
  >;
  probeVideoSubtitles: (paths: string[]) => Promise<
    | {
        ok: true;
        videos: Array<{
          path: string;
          name: string;
          tracks: Array<{
            streamIndex: number;
            subtitleIndex: number;
            codec: string;
            language: string;
            title: string;
            isText: boolean;
          }>;
        }>;
      }
    | { ok: false; error: string }
  >;
  extractSubtitles: (
    paths: string[],
    selection:
      | { mode: "all" }
      | { mode: "track"; streamIndex: number }
      | { mode: "subtitleIndex"; subtitleIndex: number }
      | { mode: "language"; language: string },
  ) => Promise<
    | {
        ok: true;
        results: Array<{
          videoPath: string;
          videoName: string;
          files: Array<{
            videoPath: string;
            videoName: string;
            outPath: string;
            outName: string;
            streamIndex: number;
            language: string;
          }>;
          skipped: Array<{ streamIndex: number; reason: string }>;
          error?: string;
        }>;
      }
    | { ok: false; error: string }
  >;
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
