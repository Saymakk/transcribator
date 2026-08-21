/**
 * App updates from GitHub Releases (default) or a custom feed.
 * On every launch: check, then ask to download and install.
 * Download can be paused and resumed.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater, CancellationToken, type UpdateInfo } from "electron-updater";
import { getMessages, t, type LocaleId } from "../src/shared/i18n";
import {
  classifyUpdateFeed,
  githubLatestDownloadUrl,
  type UpdatePrefs,
} from "../src/shared/updateFeed";
import {
  checkCustomFeed,
  getCustomDownloadSnapshot,
  getPendingInstaller,
  inspectGithubRelease,
  installPendingNsis,
  isCustomDownloadActive,
  pauseCustomDownload,
  resumeCustomDownload,
} from "./updateFeeds";

export type UpdateStatusPayload =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; releaseNotes?: string | null }
  | {
      status: "downloading";
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | {
      status: "paused";
      version: string;
      percent: number;
      transferred?: number;
      total?: number;
    }
  | { status: "downloaded"; version: string }
  | { status: "not-available"; version: string }
  | { status: "error"; message: string }
  | { status: "disabled"; reason: string };

let lastPayload: UpdateStatusPayload = { status: "idle" };
let started = false;
let promptOpen = false;
let getPrefs: () => UpdatePrefs = () => ({ provider: "github", url: "" });
let getLocale: () => LocaleId = () => "en";

let downloadToken: CancellationToken | null = null;
let downloadBusy = false;
let installAfterDownload = false;
let knownUpdateVersion = "";
let lastDownloadPercent = 0;
let lastTransferred = 0;
let lastTotal = 0;

function broadcast(payload: UpdateStatusPayload): void {
  lastPayload = payload;
  if (payload.status === "available") {
    knownUpdateVersion = payload.version;
  } else if (payload.status === "downloading") {
    lastDownloadPercent = payload.percent;
    lastTransferred = payload.transferred;
    lastTotal = payload.total;
  } else if (payload.status === "paused") {
    knownUpdateVersion = payload.version;
    lastDownloadPercent = payload.percent;
    lastTransferred = payload.transferred ?? lastTransferred;
    lastTotal = payload.total ?? lastTotal;
  } else if (payload.status === "downloaded") {
    knownUpdateVersion = payload.version;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update:status", payload);
  }
}

export function getUpdateStatus(): UpdateStatusPayload {
  return lastPayload;
}

function feedErrorMessage(error: unknown): string {
  const m = getMessages(getLocale());
  const raw = error instanceof Error ? error.message : String(error);
  if (/cancell?ed|abort/i.test(raw)) {
    return raw;
  }
  if (
    /noGithubRelease|no published versions|Unable to find latest version|406 |releases\/latest/i.test(
      raw,
    )
  ) {
    return t(m, "update.noGithubRelease");
  }
  if (/noGithubAssets|latest\.yml|CHANNEL_FILE_NOT_FOUND|Cannot find latest/i.test(raw)) {
    return t(m, "update.noGithubAssets");
  }
  return raw.split("Headers:")[0].split("Data:")[0].replace(/\s+/g, " ").trim().slice(0, 280);
}

function isCancelError(error: unknown): boolean {
  if (!error) return false;
  if (downloadToken?.cancelled) return true;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "CancellationError" ||
    /cancell?ed|abort/i.test(message)
  );
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
    provider: "generic",
    url: githubLatestDownloadUrl(),
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

function broadcastPaused(): void {
  const snap = getCustomDownloadSnapshot();
  broadcast({
    status: "paused",
    version: snap?.version || knownUpdateVersion || app.getVersion(),
    percent: snap?.percent ?? lastDownloadPercent,
    transferred: snap?.transferred ?? lastTransferred,
    total: snap?.total ?? lastTotal,
  });
}

async function runElectronDownload(): Promise<"done" | "paused"> {
  downloadToken = new CancellationToken();
  const token = downloadToken;
  try {
    await autoUpdater.downloadUpdate(token);
    return token.cancelled ? "paused" : "done";
  } catch (error) {
    if (token.cancelled || isCancelError(error)) {
      return "paused";
    }
    throw error;
  } finally {
    if (downloadToken === token) downloadToken = null;
  }
}

async function downloadUpdate(options?: { installAfter?: boolean }): Promise<void> {
  if (downloadBusy) return;
  downloadBusy = true;
  installAfterDownload = Boolean(options?.installAfter);
  const prefs = getPrefs();
  const kind = classifyUpdateFeed(prefs);

  try {
    if (kind === "yandex" || kind === "google-drive") {
      if (lastPayload.status === "paused" && getCustomDownloadSnapshot()) {
        await resumeCustomDownload(broadcast);
      } else {
        await checkCustomFeed(prefs, broadcast, { download: true });
      }
      if (lastPayload.status === "paused") {
        installAfterDownload = false;
        return;
      }
      if (installAfterDownload && getPendingInstaller()) {
        installPendingNsis(true, true);
        app.quit();
      }
      return;
    }

    const outcome = await runElectronDownload();
    if (outcome === "paused") {
      broadcastPaused();
      installAfterDownload = false;
      return;
    }
    if (installAfterDownload) {
      autoUpdater.quitAndInstall(true, true);
    }
  } catch (error) {
    if (isCancelError(error)) {
      broadcastPaused();
      installAfterDownload = false;
      return;
    }
    broadcast({ status: "error", message: feedErrorMessage(error) });
  } finally {
    downloadBusy = false;
  }
}

function pauseDownload(): boolean {
  if (isCustomDownloadActive()) {
    pauseCustomDownload();
    return true;
  }
  if (downloadToken && !downloadToken.cancelled) {
    downloadToken.cancel();
    return true;
  }
  return false;
}

async function resumeDownload(): Promise<void> {
  for (let i = 0; i < 80 && downloadBusy; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
  }
  if (lastPayload.status !== "paused" && lastPayload.status !== "available") {
    return;
  }
  await downloadUpdate({ installAfter: false });
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
    if (accepted) await downloadUpdate({ installAfter: true });
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

  try {
    if (kind === "github") {
      const gh = await inspectGithubRelease();
      const m = getMessages(getLocale());
      if (!gh.ok) {
        const message = t(m, gh.errorKey, gh.tag ? { tag: gh.tag } : undefined);
        broadcast({ status: "error", message });
        return { ok: false as const, error: message };
      }
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.disableWebInstaller = true;
      autoUpdater.setFeedURL({ provider: "generic", url: gh.feedUrl });
    } else {
      applyElectronFeed(prefs);
    }

    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version ?? null;
    if (result?.isUpdateAvailable && version) {
      knownUpdateVersion = version;
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
    const message = feedErrorMessage(error);
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
    if (downloadToken?.cancelled) return;
    broadcast({
      status: "downloading",
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    if (downloadToken?.cancelled) return;
    broadcast({ status: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    if (downloadToken?.cancelled || isCancelError(err)) {
      broadcastPaused();
      return;
    }
    broadcast({
      status: "error",
      message: feedErrorMessage(err),
    });
  });

  ipcMain.handle("update:getStatus", () => lastPayload);
  ipcMain.handle("update:check", () => runCheck({ prompt: true }));
  ipcMain.handle("update:downloadAndInstall", () => downloadUpdate({ installAfter: true }));
  ipcMain.handle("update:pauseDownload", () => {
    const ok = pauseDownload();
    if (ok) broadcastPaused();
    return ok;
  });
  ipcMain.handle("update:resumeDownload", () => resumeDownload());
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
