import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  nativeTheme,
  dialog,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { AppStore } from "./store";
import { KeyboardEngine } from "./keyboard/hook";
import { extractDocumentText, extractMontageLines, setExtractLocale } from "./documentExtract";
import type { AppState, Layout, LocaleId, TranslitMode } from "./shared/types";
import { DOCUMENT_EXTENSIONS } from "../src/shared/documentFormats";
import { VIDEO_EXTENSIONS } from "../src/shared/videoFormats";
import {
  EXPORT_FILTER_DEFS,
  ensureExportExtension,
  extOfPath,
} from "../src/shared/exportFormats";
import { getMessages, t, normalizeLocale } from "../src/shared/i18n";
import { encodeExportContent } from "./exportDocument";
import { formatChordLabel } from "../src/shared/hotkeys";
import { applyUpdatePrefs, setupAutoUpdater } from "./updater";
import {
  extractSubtitlesFromVideos,
  probeVideoSubtitles,
  type ExtractSelection,
} from "./subtitleExtract";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: AppStore;
let keyboardEngine: KeyboardEngine;
let isQuitting = false;
let closePromptOpen = false;

const isDev = !app.isPackaged;

function msg() {
  return getMessages(store.getState().locale);
}

function openDialogFilters() {
  const m = msg();
  return [
    { name: t(m, "files.filterAll"), extensions: ["*"] },
    {
      name: t(m, "files.filterAllSupported"),
      extensions: [...DOCUMENT_EXTENSIONS],
    },
    {
      name: t(m, "files.filterDocs"),
      extensions: ["pdf", "docx", "doc", "odt", "rtf", "fb2", "epub"],
    },
    {
      name: t(m, "files.filterSheets"),
      extensions: ["xlsx", "xlsm", "xls", "xlsb", "ods", "csv", "tsv"],
    },
    {
      name: t(m, "files.filterSlides"),
      extensions: ["pptx", "pptm", "odp"],
    },
    {
      name: t(m, "files.filterText"),
      extensions: ["txt", "md", "html", "htm", "xml", "json", "yaml", "yml", "log", "srt", "vtt", "ass", "ssa"],
    },
    {
      name: t(m, "files.filterVideo"),
      extensions: [...VIDEO_EXTENSIONS],
    },
  ];
}

function videoOpenDialogFilters() {
  const m = msg();
  return [
    {
      name: t(m, "files.filterVideo"),
      extensions: [...VIDEO_EXTENSIONS],
    },
    { name: t(m, "files.filterAll"), extensions: ["*"] },
  ];
}

function syncAppFocusSuppress(): void {
  const focused = BrowserWindow.getFocusedWindow();
  const ours = Boolean(mainWindow && focused === mainWindow && mainWindow.isVisible());
  keyboardEngine?.setSuppressForAppFocus(ours);
}

function installAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") {
    template.push({ role: "appMenu" });
  }
  template.push({ role: "editMenu" });
  template.push({ role: "viewMenu" });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function assetPath(...parts: string[]): string {
  if (isDev) {
    return path.join(process.cwd(), "assets", ...parts);
  }
  return path.join(process.resourcesPath, "assets", ...parts);
}

function showMainWindowMaximized(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.maximize();
    mainWindow.show();
  } else if (!mainWindow.isMaximized()) {
    mainWindow.maximize();
  }
  mainWindow.focus();
}

async function handleWindowClose(): Promise<void> {
  if (!mainWindow || isQuitting || closePromptOpen) return;
  closePromptOpen = true;
  const m = msg();
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: t(m, "tray.closeTitle"),
      message: t(m, "tray.closeMessage"),
      buttons: [
        t(m, "tray.minimizeToTray"),
        t(m, "tray.quit"),
        t(m, "tray.cancelClose"),
      ],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 0) {
      mainWindow.hide();
    } else if (response === 1) {
      isQuitting = true;
      keyboardEngine?.stop();
      app.quit();
    }
  } finally {
    closePromptOpen = false;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: "Transcribator",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void handleWindowClose();
  });

  mainWindow.once("ready-to-show", () => {
    showMainWindowMaximized();
  });

  mainWindow.on("focus", () => syncAppFocusSuppress());
  mainWindow.on("blur", () => syncAppFocusSuppress());
  mainWindow.on("show", () => syncAppFocusSuppress());
  mainWindow.on("hide", () => syncAppFocusSuppress());

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function modeLabel(mode: TranslitMode): string {
  const m = msg();
  switch (mode) {
    case "forward":
      return t(m, "tray.modeForward");
    case "reverse":
      return t(m, "tray.modeReverse");
    default:
      return t(m, "tray.modeOff");
  }
}

function trayIconForMode(mode: TranslitMode): Electron.NativeImage {
  const file =
    mode === "forward"
      ? "tray-forward.png"
      : mode === "reverse"
        ? "tray-reverse.png"
        : "tray-off.png";
  const img = nativeImage.createFromPath(assetPath(file));
  if (process.platform === "darwin") {
    img.setTemplateImage(true);
  }
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function broadcastState(state: AppState): void {
  mainWindow?.webContents.send("state:changed", state);
  updateTray();
}

function updateTray(): void {
  if (!tray) return;
  const state = store.getState();
  const m = msg();
  tray.setImage(trayIconForMode(state.mode));
  tray.setToolTip(t(m, "tray.tooltip", { mode: modeLabel(state.mode) }));

  const layoutItems = state.layouts.map((layout) => ({
    label: layout.name,
    type: "radio" as const,
    checked: layout.id === state.activeLayoutId,
    click: () => {
      broadcastState(store.setActiveLayout(layout.id));
    },
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: t(m, "tray.mode", { mode: modeLabel(state.mode) }),
      enabled: false,
    },
    {
      label: state.hookActive ? t(m, "tray.hookOn") : t(m, "tray.hookOff"),
      enabled: false,
    },
    { type: "separator" },
    {
      label: t(m, "tray.openSettings"),
      click: () => {
        showMainWindowMaximized();
        mainWindow?.webContents.send("app:navigate", "settings");
      },
    },
    { type: "separator" },
    {
      label: t(m, "tray.forward", {
        chord: formatChordLabel(state.hotkeys.chordFirst, state.hotkeys.chordSecond),
      }),
      type: "radio",
      checked: state.mode === "forward",
      click: () => broadcastState(store.toggleMode("forward")),
    },
    {
      label: t(m, "tray.reverse", {
        chord: formatChordLabel(state.hotkeys.chordSecond, state.hotkeys.chordFirst),
      }),
      type: "radio",
      checked: state.mode === "reverse",
      click: () => broadcastState(store.toggleMode("reverse")),
    },
    {
      label: t(m, "tray.translitOff"),
      type: "radio",
      checked: state.mode === "off",
      click: () => broadcastState(store.setMode("off")),
    },
    { type: "separator" },
    {
      label: t(m, "tray.activeLayout"),
      submenu: layoutItems,
    },
    { type: "separator" },
    {
      label: t(m, "tray.quit"),
      click: () => {
        isQuitting = true;
        keyboardEngine.stop();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  tray = new Tray(trayIconForMode(store.getState().mode));
  tray.on("click", () => {
    showMainWindowMaximized();
  });
  tray.on("double-click", () => {
    showMainWindowMaximized();
  });
  updateTray();
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => store.getState());

  ipcMain.handle("state:setActiveLayout", (_e, id: string) => {
    const state = store.setActiveLayout(id);
    updateTray();
    return state;
  });

  ipcMain.handle("state:setMode", (_e, mode: TranslitMode) => {
    const state = store.setMode(mode);
    updateTray();
    return state;
  });

  ipcMain.handle("state:toggleMode", (_e, target: "forward" | "reverse") => {
    const state = store.toggleMode(target);
    updateTray();
    return state;
  });

  ipcMain.handle("palette:setCustom", (_e, palettes: import("./shared/types").CustomPalette[]) => {
    const state = store.setCustomPalettes(palettes);
    updateTray();
    return state;
  });

  ipcMain.handle("palette:upsert", (_e, palette: import("./shared/types").CustomPalette) => {
    const state = store.upsertCustomPalette(palette);
    updateTray();
    return state;
  });

  ipcMain.handle("palette:delete", (_e, id: string) => {
    const state = store.deleteCustomPalette(id);
    updateTray();
    return state;
  });

  const MONTAGES_EXT = /\.(docx|doc|dotx)$/i;

async function readOpenedFile(filePath: string): Promise<{
  name: string;
  text: string;
  montageLines?: { text: string; colored?: boolean }[];
}> {
  const name = path.basename(filePath);
  const data = fs.readFileSync(filePath);
  const text = await extractDocumentText(name, data);
  if (!MONTAGES_EXT.test(name)) return { name, text };
  const montageLines = await extractMontageLines(name, data);
  return { name, text, montageLines };
}

ipcMain.handle("file:openDocument", async () => {
    const result = await dialog.showOpenDialog({
      title: t(msg(), "files.openTitle"),
      properties: ["openFile"],
      filters: openDialogFilters(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const };
    }
    try {
      const item = await readOpenedFile(result.filePaths[0]);
      return { ok: true as const, ...item };
    } catch (error) {
      return {
        ok: false as const,
        canceled: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("file:openDocuments", async () => {
    const result = await dialog.showOpenDialog({
      title: t(msg(), "files.openTitle"),
      properties: ["openFile", "multiSelections"],
      filters: openDialogFilters(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const };
    }
    try {
      const items = [];
      for (const filePath of result.filePaths) {
        items.push(await readOpenedFile(filePath));
      }
      return { ok: true as const, items };
    } catch (error) {
      return {
        ok: false as const,
        canceled: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /** Обратная совместимость со старым preload/API. */
  ipcMain.handle("file:openTextOrPdf", async () => {
    const result = await dialog.showOpenDialog({
      title: t(msg(), "files.openTitle"),
      properties: ["openFile"],
      filters: openDialogFilters(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const };
    }
    const filePath = result.filePaths[0];
    const name = path.basename(filePath);
    try {
      const data = fs.readFileSync(filePath);
      const text = await extractDocumentText(name, data);
      return { ok: true as const, kind: "text" as const, name, text };
    } catch (error) {
      return {
        ok: false as const,
        canceled: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "file:extractDocument",
    async (_e, fileName: string, bytes: ArrayBuffer | Uint8Array) => {
      try {
        const name = String(fileName || "file");
        const text = await extractDocumentText(name, bytes);
        const montageLines = MONTAGES_EXT.test(name)
          ? await extractMontageLines(name, bytes)
          : undefined;
        return { ok: true as const, text, montageLines };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle("file:openVideos", async () => {
    const result = await dialog.showOpenDialog({
      title: t(msg(), "files.openVideoTitle"),
      properties: ["openFile", "multiSelections"],
      filters: videoOpenDialogFilters(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const };
    }
    return { ok: true as const, paths: result.filePaths };
  });

  ipcMain.handle("file:probeVideoSubtitles", async (_e, paths: string[]) => {
    try {
      const list = Array.isArray(paths) ? paths.map(String).filter(Boolean) : [];
      if (list.length === 0) {
        return { ok: false as const, error: "No video paths" };
      }
      const videos = [];
      for (const p of list) {
        videos.push(await probeVideoSubtitles(p));
      }
      return { ok: true as const, videos };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "file:extractSubtitles",
    async (_e, paths: string[], selection: ExtractSelection) => {
      try {
        const list = Array.isArray(paths) ? paths.map(String).filter(Boolean) : [];
        if (list.length === 0) {
          return { ok: false as const, error: "No video paths" };
        }
        const sel: ExtractSelection =
          selection?.mode === "track" && typeof selection.streamIndex === "number"
            ? { mode: "track", streamIndex: selection.streamIndex }
            : selection?.mode === "subtitleIndex" && typeof selection.subtitleIndex === "number"
              ? { mode: "subtitleIndex", subtitleIndex: selection.subtitleIndex }
              : selection?.mode === "language" && typeof selection.language === "string"
                ? { mode: "language", language: selection.language }
                : { mode: "all" };
        const results = await extractSubtitlesFromVideos(list, sel);
        return { ok: true as const, results };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle("file:saveText", async (_e, suggestedName: string, content: string) => {
    const m = msg();
    const suggested = suggestedName || "result.txt";
    const fallbackExt = extOfPath(suggested) || "txt";
    const result = await dialog.showSaveDialog({
      title: t(m, "files.saveTitle"),
      defaultPath: suggested,
      filters: EXPORT_FILTER_DEFS.map((f) => ({
        name: t(m, `files.${f.labelKey}`),
        extensions: f.extensions,
      })),
    });
    if (result.canceled || !result.filePath) {
      return { ok: false as const, canceled: true as const };
    }
    try {
      const filePath = ensureExportExtension(result.filePath, fallbackExt);
      const data = await encodeExportContent(String(content ?? ""), filePath);
      fs.writeFileSync(filePath, data);
      return { ok: true as const, path: filePath };
    } catch (error) {
      return {
        ok: false as const,
        canceled: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("state:setLocale", (_e, locale: LocaleId) => {
    const state = store.setLocale(normalizeLocale(locale));
    setExtractLocale(state.locale);
    updateTray();
    return state;
  });

  ipcMain.handle("state:setLaunchAtLogin", (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    const state = store.setLaunchAtLogin(enabled);
    return state;
  });

  ipcMain.handle("state:setHotkeys", (_e, hotkeys) => {
    const state = store.setHotkeys(hotkeys);
    keyboardEngine.syncHotkeysFromStore();
    updateTray();
    return state;
  });

  ipcMain.handle("state:setAssSrtPrefs", (_e, prefs) => {
    return store.setAssSrtPrefs(prefs);
  });

  ipcMain.handle("state:setUpdatePrefs", (_e, prefs) => {
    const state = store.setUpdatePrefs(prefs);
    applyUpdatePrefs(state.updatePrefs);
    return state;
  });

  ipcMain.handle("layout:save", (_e, layout: Layout) => {
    const state = store.saveLayout(layout);
    updateTray();
    return state;
  });

  ipcMain.handle("layout:create", (_e, name: string) => {
    const fallback = t(msg(), "app.newLayout");
    const state = store.createLayout(name?.trim() ? name : fallback);
    updateTray();
    return state;
  });

  ipcMain.handle("layout:clone", (_e, id: string) => {
    const state = store.cloneLayout(id, t(msg(), "app.copySuffix"));
    updateTray();
    return state;
  });

  ipcMain.handle("layout:delete", (_e, id: string) => {
    const state = store.deleteLayout(id);
    updateTray();
    return state;
  });

  ipcMain.handle("layout:rename", (_e, id: string, name: string) => {
    const state = store.renameLayout(id, name);
    updateTray();
    return state;
  });

  ipcMain.handle("system:openAccessibility", async () => {
    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      );
    } else if (process.platform === "win32") {
      await shell.openExternal("ms-settings:privacy");
    }
    // Linux: хук зависит от X11; отдельных системных настроек нет
  });

  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    const raw = String(url || "");
    if (!/^https?:\/\//i.test(raw)) {
      return { ok: false as const, error: "Invalid URL" };
    }
    await shell.openExternal(raw);
    return { ok: true as const };
  });

  ipcMain.handle("app:getVersion", () => app.getVersion());
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindowMaximized();
  });

  app.whenReady().then(() => {
    store = new AppStore();
    setExtractLocale(store.getState().locale);
    keyboardEngine = new KeyboardEngine(store);
    keyboardEngine.setOnModeChange(() => broadcastState(store.getState()));

    installAppMenu();
    registerIpc();
    createWindow();
    createTray();
    syncAppFocusSuppress();

    const login = app.getLoginItemSettings();
    if (store.getState().launchAtLogin !== login.openAtLogin) {
      app.setLoginItemSettings({
        openAtLogin: store.getState().launchAtLogin,
        path: process.execPath,
      });
    }

    const ok = keyboardEngine.start();
    broadcastState(store.setHookActive(ok));

    setupAutoUpdater(
      () => store.getState().updatePrefs,
      () => store.getState().locale,
    );

    nativeTheme.themeSource = "system";
  });

  app.on("window-all-closed", () => {
    // remain in tray
  });

  app.on("before-quit", () => {
    isQuitting = true;
    keyboardEngine?.stop();
  });

  app.on("activate", () => {
    showMainWindowMaximized();
  });
}