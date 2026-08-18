/**
 * App updates from GitHub Releases (default) or a custom feed.
 * On every launch: check, then ask to download and install.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { getMessages, t, type LocaleId } from "../src/shared/i18n";
import {
  classifyUpdateFeed,
  type UpdatePrefs,
} from "../src/shared/updateFeed";
import {
  checkCustomFeed,
  getPendingInstaller,
  installPendingNsis,
} from "./updateFeeds";

export type UpdateStatusPayload =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; releaseNotes?: string | null }
  | { status: "downloading"; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { status: "downloaded"; version: string }
  | { status: "not-available"; version: string }
  | { status: "error"; message: string }
  | { status: "disabled"; reason: string };

let lastPayload: UpdateStatusPayload = { status: "idle" };
let started = false;
let promptOpen = false;
let getPrefs: () => UpdatePrefs = () => ({ provider: "github", url: "" });
let getLocale: () => LocaleId = () => "en";

function broadcast(payload: UpdateStatusPayload): void {
  lastPayload = payload;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update:status", payload);
  }
}

export function getUpdateStatus(): UpdateStatusPayload {
  return lastPayload;
}

function applyElectronFeed(prefs: UpdatePrefs): void {
  const kind = classifyUpdateFeed(prefs);
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableWebInstaller = true;

  if (kind === "generic-http") {
    autoUpdater.disableDifferentialDownload = false;
    autoUpdater.setFeedURL({
      provider: "generic",
      url: prefs.url.trim().replace(/\/+$/, ""),
    });
    return;
  }

  autoUpdater.disableDifferentialDownload = false;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "Saymakk",
    repo: "transcribator",
  });
}

async function promptDownloadAndInstall(version: string, notes?: string | null): Promise<boolean> {
  if (promptOpen) return false;
  promptOpen = true;
  const m = getMessages(getLocale());
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  try {
    const opts: Electron.MessageBoxOptions = {
      type: "info",
      title: t(m, "update.promptTitle"),
      message: t(m, "update.promptMessage", { version }),
      detail: notes && notes.trim() ? notes.trim().slice(0, 1000) : t(m, "update.promptDetail"),
      buttons: [t(m, "update.promptDownload"), t(m, "update.promptLater")],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    return response === 0;
  } finally {
    promptOpen = false;
  }
}

async function downloadAndInstall(): Promise<void> {
  const prefs = getPrefs();
  const kind = classifyUpdateFeed(prefs);
  if (kind === "yandex" || kind === "google-drive") {
    const result = await checkCustomFeed(prefs, broadcast, { download: true });
    if (result.ok && getPendingInstaller()) {
      installPendingNsis(true, true);
      app.quit();
    }
    return;
  }
  await autoUpdater.downloadUpdate();
  autoUpdater.quitAndInstall(true, true);
}

async function runCheck(options?: {
  prompt?: boolean;
}): Promise<{ ok: true; version: string | null } | { ok: false; error: string }> {
  const prefs = getPrefs();
  const kind = classifyUpdateFeed(prefs);
  broadcast({ status: "checking" });

  const maybePrompt = async (version: string, notes?: string | null) => {
    if (!options?.prompt) return;
    const accepted = await promptDownloadAndInstall(version, notes);
    if (accepted) await downloadAndInstall();
  };

  if (kind === "yandex" || kind === "google-drive") {
    autoUpdater.autoDownload = false;
    const result = await checkCustomFeed(prefs, broadcast, { download: false });
    if (result.ok && result.updateAvailable && result.version) {
      await maybePrompt(result.version);
    }
    return result;
  }
  if (prefs.provider === "generic" && !prefs.url.trim()) {
    const message = "Custom update URL is empty";
    broadcast({ status: "error", message });
    return { ok: false as const, error: message };
  }
  applyElectronFeed(prefs);
  try {
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version ?? null;
    if (result?.isUpdateAvailable && version) {
      const notes = result.updateInfo.releaseNotes;
      const noteText =
        typeof notes === "string"
          ? notes
          : Array.isArray(notes)
            ? notes.map((n) => (typeof n === "string" ? n : n.note)).join("\n")
            : null;
      await maybePrompt(version, noteText);
    }
    return { ok: true as const, version };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcast({ status: "error", message });
    return { ok: false as const, error: message };
  }
}

export function applyUpdatePrefs(prefs: UpdatePrefs): void {
  getPrefs = () => prefs;
  if (!app.isPackaged) return;
  const kind = classifyUpdateFeed(prefs);
  if (kind === "yandex" || kind === "google-drive") return;
  applyElectronFeed(prefs);
}

export function setupAutoUpdater(
  prefsFn: () => UpdatePrefs,
  localeFn: () => LocaleId,
): void {
  if (started) return;
  started = true;
  getPrefs = prefsFn;
  getLocale = localeFn;

  if (!app.isPackaged) {
    broadcast({ status: "disabled", reason: "dev" });
    return;
  }

  applyElectronFeed(prefsFn());

  autoUpdater.on("checking-for-update", () => {
    broadcast({ status: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    broadcast({
      status: "available",
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === "string"
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n) => (typeof n === "string" ? n : n.note)).join("\n")
            : null,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    broadcast({ status: "not-available", version: info.version });
  });

  autoUpdater.on("download-progress", (p) => {
    broadcast({
      status: "downloading",
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    broadcast({ status: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    broadcast({
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });

  ipcMain.handle("update:getStatus", () => lastPayload);
  ipcMain.handle("update:check", () => runCheck({ prompt: true }));
  ipcMain.handle("update:downloadAndInstall", () => downloadAndInstall());
  ipcMain.handle("update:install", () => {
    if (getPendingInstaller()) {
      const ok = installPendingNsis(true, true);
      if (ok) app.quit();
      return;
    }
    autoUpdater.quitAndInstall(true, true);
  });

  setTimeout(() => {
    void runCheck({ prompt: true }).catch(() => {
      /* error already broadcast */
    });
  }, 2500);
}
