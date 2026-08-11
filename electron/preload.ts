import { contextBridge, ipcRenderer } from "electron";
import type {
  AppState,
  Layout,
  PuntoDictEntry,
  PuntoMode,
  PuntoPairId,
  TranslitMode,
} from "./shared/types";

export type OpenFileResult =
  | { ok: true; name: string; text: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type ExtractResult =
  | { ok: true; text: string }
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
  setPuntoMode: (mode: PuntoMode): Promise<AppState> =>
    ipcRenderer.invoke("state:setPuntoMode", mode),
  togglePuntoMode: (target: "a2b" | "b2a" | "auto"): Promise<AppState> =>
    ipcRenderer.invoke("state:togglePuntoMode", target),
  setPuntoPairId: (id: PuntoPairId): Promise<AppState> =>
    ipcRenderer.invoke("punto:setPair", id),
  setPuntoDictionary: (entries: PuntoDictEntry[]): Promise<AppState> =>
    ipcRenderer.invoke("punto:setDictionary", entries),
  setLaunchAtLogin: (enabled: boolean): Promise<AppState> =>
    ipcRenderer.invoke("state:setLaunchAtLogin", enabled),
  setHotkeys: (hotkeys: import("./shared/types").HotkeysConfig): Promise<AppState> =>
    ipcRenderer.invoke("state:setHotkeys", hotkeys),
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
  /** @deprecated use openDocument */
  openTextOrPdf: (): Promise<OpenFileResult> => ipcRenderer.invoke("file:openDocument"),
  extractDocument: (name: string, bytes: ArrayBuffer): Promise<ExtractResult> =>
    ipcRenderer.invoke("file:extractDocument", name, bytes),
  saveText: (suggestedName: string, content: string): Promise<SaveFileResult> =>
    ipcRenderer.invoke("file:saveText", suggestedName, content),
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
};

contextBridge.exposeInMainWorld("transcribator", api);
