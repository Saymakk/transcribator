import { contextBridge, ipcRenderer } from "electron";
import type {
  AppState,
  Layout,
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

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("state:get"),
  setActiveLayout: (id: string): Promise<AppState> =>
    ipcRenderer.invoke("state:setActiveLayout", id),
  setMode: (mode: TranslitMode): Promise<AppState> =>
    ipcRenderer.invoke("state:setMode", mode),
  toggleMode: (target: "forward" | "reverse"): Promise<AppState> =>
    ipcRenderer.invoke("state:toggleMode", target),
  setLaunchAtLogin: (enabled: boolean): Promise<AppState> =>
    ipcRenderer.invoke("state:setLaunchAtLogin", enabled),
  setHotkeys: (hotkeys: import("./shared/types").HotkeysConfig): Promise<AppState> =>
    ipcRenderer.invoke("state:setHotkeys", hotkeys),
  setAssSrtPrefs: (
    prefs: import("./shared/types").AssSrtPrefs,
  ): Promise<AppState> => ipcRenderer.invoke("state:setAssSrtPrefs", prefs),
  setUpdatePrefs: (
    prefs: import("./shared/types").UpdatePrefs,
  ): Promise<AppState> => ipcRenderer.invoke("state:setUpdatePrefs", prefs),
  setLocale: (locale: import("./shared/types").LocaleId): Promise<AppState> =>
    ipcRenderer.invoke("state:setLocale", locale),
  setCustomPalettes: (
    palettes: import("./shared/types").CustomPalette[],
  ): Promise<AppState> => ipcRenderer.invoke("palette:setCustom", palettes),
  upsertCustomPalette: (
    palette: import("./shared/types").CustomPalette,
  ): Promise<AppState> => ipcRenderer.invoke("palette:upsert", palette),
  deleteCustomPalette: (id: string): Promise<AppState> =>
    ipcRenderer.invoke("palette:delete", id),
  saveLayout: (layout: Layout): Promise<AppState> =>
    ipcRenderer.invoke("layout:save", layout),
  createLayout: (name: string): Promise<AppState> =>
    ipcRenderer.invoke("layout:create", name),
  cloneLayout: (id: string): Promise<AppState> =>
    ipcRenderer.invoke("layout:clone", id),
  deleteLayout: (id: string): Promise<AppState> =>
    ipcRenderer.invoke("layout:delete", id),
  renameLayout: (id: string, name: string): Promise<AppState> =>
    ipcRenderer.invoke("layout:rename", id, name),
  openAccessibilitySettings: (): Promise<void> =>
    ipcRenderer.invoke("system:openAccessibility"),
  openDocument: (): Promise<OpenFileResult> => ipcRenderer.invoke("file:openDocument"),
  openDocuments: (): Promise<OpenFilesResult> => ipcRenderer.invoke("file:openDocuments"),
  /** @deprecated use openDocument */
  openTextOrPdf: (): Promise<OpenFileResult> => ipcRenderer.invoke("file:openDocument"),
  extractDocument: (name: string, bytes: ArrayBuffer): Promise<ExtractResult> =>
    ipcRenderer.invoke("file:extractDocument", name, bytes),
  openVideos: (): Promise<
    | { ok: true; paths: string[] }
    | { ok: false; canceled: true }
    | { ok: false; canceled: false; error: string }
  > => ipcRenderer.invoke("file:openVideos"),
  probeVideoSubtitles: (
    paths: string[],
  ): Promise<
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
  > => ipcRenderer.invoke("file:probeVideoSubtitles", paths),
  extractSubtitles: (
    paths: string[],
    selection:
      | { mode: "all" }
      | { mode: "track"; streamIndex: number }
      | { mode: "subtitleIndex"; subtitleIndex: number }
      | { mode: "language"; language: string },
  ): Promise<
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
  > => ipcRenderer.invoke("file:extractSubtitles", paths, selection),
  saveText: (suggestedName: string, content: string): Promise<SaveFileResult> =>
    ipcRenderer.invoke("file:saveText", suggestedName, content),
  openExternal: (url: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke("shell:openExternal", url),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  getUpdateStatus: (): Promise<unknown> => ipcRenderer.invoke("update:getStatus"),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke("update:check"),
  downloadAndInstallUpdate: (): Promise<void> => ipcRenderer.invoke("update:downloadAndInstall"),
  pauseUpdateDownload: (): Promise<boolean> => ipcRenderer.invoke("update:pauseDownload"),
  resumeUpdateDownload: (): Promise<void> => ipcRenderer.invoke("update:resumeDownload"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  onStateChanged: (cb: (state: AppState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => cb(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onNavigate: (cb: (section: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, section: string) => cb(section);
    ipcRenderer.on("app:navigate", listener);
    return () => ipcRenderer.removeListener("app:navigate", listener);
  },
  onUpdateStatus: (cb: (status: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => cb(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
};

contextBridge.exposeInMainWorld("transcribator", api);
