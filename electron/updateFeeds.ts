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
  githubTagDownloadUrl,
  GITHUB_RELEASES,
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

async function downloadFile(
  url: string,
  dest: string,
  onProgress: ProgressFn,
  options?: { signal?: AbortSignal; startAt?: number },
): Promise<void> {
  const startAt = Math.max(0, options?.startAt ?? 0);
  const headers: Record<string, string> = {};
  if (startAt > 0) headers.Range = `bytes=${startAt}-`;

  const res = await net.fetch(url, {
    redirect: "follow",
    headers,
    signal: options?.signal,
  });
  if (!(res.ok || res.status === 206)) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("text/html")) {
    throw new Error("Got an HTML page instead of the installer (direct download required)");
  }

  const resumed = startAt > 0 && res.status === 206;
  if (startAt > 0 && !resumed && fs.existsSync(dest)) {
    // Server ignored Range — rewrite from scratch.
    fs.unlinkSync(dest);
  }

  const contentLength = Number(res.headers.get("content-length") || 0);
  const total = resumed
    ? startAt + contentLength
    : contentLength || Number(res.headers.get("content-length") || 0);
  if (!res.body) throw new Error("Empty download body");
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  let transferred = resumed ? startAt : 0;
  const started = Date.now();
  const onAbort = () => {
    nodeStream.destroy(new Error("aborted"));
  };
  options?.signal?.addEventListener("abort", onAbort, { once: true });

  nodeStream.on("data", (chunk: Buffer) => {
    transferred += chunk.length;
    const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
    onProgress({
      percent: total > 0 ? (transferred / total) * 100 : 0,
      transferred,
      total,
      bytesPerSecond: (transferred - (resumed ? startAt : 0)) / elapsed,
    });
  });

  try {
    await pipeline(
      nodeStream,
      fs.createWriteStream(dest, { flags: resumed ? "a" : "w" }),
    );
  } finally {
    options?.signal?.removeEventListener("abort", onAbort);
  }
}

type CustomDownloadJob = {
  url: string;
  dest: string;
  version: string;
  transferred: number;
  total: number;
};

let customJob: CustomDownloadJob | null = null;
let customAbort: AbortController | null = null;

export function isCustomDownloadActive(): boolean {
  return Boolean(customAbort);
}

export function getCustomDownloadSnapshot(): {
  version: string;
  percent: number;
  transferred: number;
  total: number;
} | null {
  if (!customJob) return null;
  const percent =
    customJob.total > 0 ? (customJob.transferred / customJob.total) * 100 : 0;
  return {
    version: customJob.version,
    percent,
    transferred: customJob.transferred,
    total: customJob.total,
  };
}

export function pauseCustomDownload(): boolean {
  if (!customAbort) return false;
  customAbort.abort();
  customAbort = null;
  return true;
}

export async function resumeCustomDownload(
  broadcast: (p: UpdateStatusPayload) => void,
): Promise<boolean> {
  if (!customJob) return false;
  await runCustomInstallerDownload(customJob, broadcast);
  return true;
}

async function runCustomInstallerDownload(
  job: CustomDownloadJob,
  broadcast: (p: UpdateStatusPayload) => void,
): Promise<void> {
  customJob = job;
  const controller = new AbortController();
  customAbort = controller;
  const existing =
    fs.existsSync(job.dest) && job.transferred > 0
      ? fs.statSync(job.dest).size
      : 0;
  const startAt = existing > 0 ? existing : 0;
  job.transferred = startAt;

  try {
    await downloadFile(
      job.url,
      job.dest,
      (p) => {
        job.transferred = p.transferred;
        job.total = p.total || job.total;
        broadcast({
          status: "downloading",
          percent: p.percent,
          bytesPerSecond: p.bytesPerSecond,
          transferred: p.transferred,
          total: p.total,
        });
      },
      { signal: controller.signal, startAt },
    );
    pendingInstaller = job.dest;
    customAbort = null;
    broadcast({ status: "downloaded", version: job.version });
  } catch (error) {
    customAbort = null;
    if (controller.signal.aborted || (error instanceof Error && /aborted|AbortError/i.test(error.message))) {
      const percent = job.total > 0 ? (job.transferred / job.total) * 100 : 0;
      broadcast({
        status: "paused",
        version: job.version,
        percent,
        transferred: job.transferred,
        total: job.total,
      });
      return;
    }
    throw error;
  }
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
    await runCustomInstallerDownload(
      {
        url: installerUrl,
        dest,
        version: meta.version,
        transferred: 0,
        total: 0,
      },
      broadcast,
    );
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

type GithubAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type GithubRelease = {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
  body?: string | null;
};

export type GithubReleaseCheck =
  | { ok: true; tag: string; feedUrl: string; notes: string | null }
  | { ok: false; errorKey: "update.noGithubRelease" | "update.noGithubAssets"; tag?: string };

async function githubApi<T>(path: string): Promise<{ status: number; data: T | null }> {
  const { owner, repo } = GITHUB_RELEASES;
  const res = await net.fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Transcribator",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) {
    throw new Error(`GitHub API HTTP ${res.status}`);
  }
  return { status: res.status, data: (await res.json()) as T };
}

function hasLatestYml(release: GithubRelease): boolean {
  return (release.assets ?? []).some((a) => /^latest.*\.yml$/i.test(a.name));
}

export async function inspectGithubRelease(): Promise<GithubReleaseCheck> {
  let latest = (await githubApi<GithubRelease>("/releases/latest")).data;
  if (!latest) {
    const list = (await githubApi<GithubRelease[]>("/releases?per_page=10")).data ?? [];
    latest = list.find((r) => !r.draft && !r.prerelease && hasLatestYml(r)) ?? list.find((r) => !r.draft) ?? null;
  }
  if (!latest) {
    return { ok: false, errorKey: "update.noGithubRelease" };
  }
  if (!hasLatestYml(latest)) {
    return { ok: false, errorKey: "update.noGithubAssets", tag: latest.tag_name };
  }
  return {
    ok: true,
    tag: latest.tag_name,
    feedUrl: githubTagDownloadUrl(latest.tag_name),
    notes: latest.body ?? null,
  };
}
