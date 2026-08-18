/**
 * Custom update feeds: Yandex Disk public folder, or a plain HTTPS directory.
 * Google Drive share pages are not used as a primary feed (virus-scan interstitial).
 */
import { app, net } from "electron";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  classifyUpdateFeed,
  isRemoteNewer,
  normalizeHttpFeedUrl,
  parseLatestYml,
  type UpdatePrefs,
} from "../src/shared/updateFeed";
import type { UpdateStatusPayload } from "./updater";

type ProgressFn = (p: {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}) => void;

let pendingInstaller: string | null = null;

export function getPendingInstaller(): string | null {
  return pendingInstaller;
}

export function clearPendingInstaller(): void {
  pendingInstaller = null;
}

function yandexPublicKey(url: string): string {
  return url.trim().split("?")[0];
}

async function yandexDownloadHref(publicKey: string, filePath: string): Promise<string> {
  const pathArg = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const api =
    "https://cloud-api.yandex.net/v1/disk/public/resources/download" +
    `?public_key=${encodeURIComponent(publicKey)}&path=${encodeURIComponent(pathArg)}`;
  const res = await net.fetch(api);
  const json = (await res.json()) as { href?: string; message?: string; error?: string };
  if (!res.ok || !json.href) {
    throw new Error(json.message || json.error || `Yandex Disk: HTTP ${res.status}`);
  }
  return json.href;
}

async function readText(url: string): Promise<string> {
  const res = await net.fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (ctype.includes("text/html") && /<html/i.test(text)) {
    throw new Error("Got an HTML page instead of a file (share link is not a direct download)");
  }
  return text;
}

async function downloadFile(url: string, dest: string, onProgress: ProgressFn): Promise<void> {
  const res = await net.fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("text/html")) {
    throw new Error("Got an HTML page instead of the installer (direct download required)");
  }
  const total = Number(res.headers.get("content-length") || 0);
  if (!res.body) throw new Error("Empty download body");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  let transferred = 0;
  const started = Date.now();
  nodeStream.on("data", (chunk: Buffer) => {
    transferred += chunk.length;
    const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
    onProgress({
      percent: total > 0 ? (transferred / total) * 100 : 0,
      transferred,
      total,
      bytesPerSecond: transferred / elapsed,
    });
  });
  await pipeline(nodeStream, fs.createWriteStream(dest));
}

export async function checkCustomFeed(
  prefs: UpdatePrefs,
  broadcast: (p: UpdateStatusPayload) => void,
  options?: { download?: boolean },
): Promise<{ ok: true; version: string | null; updateAvailable?: boolean } | { ok: false; error: string }> {
  const kind = classifyUpdateFeed(prefs);
  try {
    if (kind === "google-drive") {
      throw new Error(
        "Google Drive share links are not a reliable update feed (virus-scan HTML page). Use GitHub Releases or a Yandex Disk public folder.",
      );
    }

    let ymlText: string;
    let installerUrl: string;
    let fileName: string;

    if (kind === "yandex") {
      const key = yandexPublicKey(prefs.url);
      const ymlHref = await yandexDownloadHref(key, "/latest.yml");
      ymlText = await readText(ymlHref);
      const meta = parseLatestYml(ymlText);
      fileName = path.posix.basename(meta.path.replace(/\\/g, "/"));
      installerUrl = await yandexDownloadHref(key, `/${fileName}`);
    } else {
      const base = normalizeHttpFeedUrl(prefs.url);
      ymlText = await readText(`${base}/latest.yml`);
      const meta = parseLatestYml(ymlText);
      fileName = meta.path;
      installerUrl = /^https?:\/\//i.test(meta.path)
        ? meta.path
        : `${base}/${meta.path.split("/").map(encodeURIComponent).join("/")}`;
    }

    const meta = parseLatestYml(ymlText);
    const current = app.getVersion();
    if (!isRemoteNewer(meta.version, current)) {
      broadcast({ status: "not-available", version: current });
      return { ok: true, version: current, updateAvailable: false };
    }

    broadcast({ status: "available", version: meta.version, releaseNotes: null });
    if (!options?.download) {
      return { ok: true, version: meta.version, updateAvailable: true };
    }
    const dest = path.join(app.getPath("temp"), "transcribator-updates", fileName);
    await downloadFile(installerUrl, dest, (p) => {
      broadcast({
        status: "downloading",
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    });
    pendingInstaller = dest;
    broadcast({ status: "downloaded", version: meta.version });
    return { ok: true, version: meta.version, updateAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcast({ status: "error", message });
    return { ok: false, error: message };
  }
}

export function installPendingNsis(isSilent: boolean, forceRun: boolean): boolean {
  if (!pendingInstaller || !fs.existsSync(pendingInstaller)) return false;
  const args = ["--updated"];
  if (isSilent) args.push("/S");
  if (forceRun) args.push("--force-run");
  const child = spawn(pendingInstaller, args, { detached: true, stdio: "ignore" });
  child.unref();
  return true;
}
