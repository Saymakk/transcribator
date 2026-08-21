import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { app } from "electron";

const require = createRequire(import.meta.url);

type BinKind = "ffmpeg" | "ffprobe";

let cachedFfmpeg: string | null | undefined;
let cachedFfprobe: string | null | undefined;

function unpackAsarPath(p: string): string {
  return p.includes("app.asar") ? p.replace("app.asar", "app.asar.unpacked") : p;
}

function whichOnPath(cmd: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  const names =
    process.platform === "win32" ? [`${cmd}.exe`, cmd] : [cmd];
  for (const dir of parts) {
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function resolveStaticBin(kind: BinKind): string | null {
  try {
    if (kind === "ffmpeg") {
      const mod = require("ffmpeg-static") as string | null;
      if (typeof mod === "string") {
        const p = unpackAsarPath(mod);
        if (fs.existsSync(p)) return p;
      }
    } else {
      const mod = require("ffprobe-static") as { path?: string } | string | null;
      const raw = typeof mod === "string" ? mod : mod?.path;
      if (raw) {
        const p = unpackAsarPath(raw);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    /* optional */
  }

  if (app.isPackaged) {
    const name = process.platform === "win32" ? `${kind}.exe` : kind;
    const candidate = path.join(process.resourcesPath, "bin", name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function getFfmpegPath(): string | null {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;
  cachedFfmpeg = whichOnPath("ffmpeg") ?? resolveStaticBin("ffmpeg");
  return cachedFfmpeg;
}

export function getFfprobePath(): string | null {
  if (cachedFfprobe !== undefined) return cachedFfprobe;
  cachedFfprobe = whichOnPath("ffprobe") ?? resolveStaticBin("ffprobe");
  return cachedFfprobe;
}

export function assertMediaTools(): { ffmpeg: string; ffprobe: string } {
  const ffmpeg = getFfmpegPath();
  const ffprobe = getFfprobePath();
  if (!ffmpeg || !ffprobe) {
    throw new Error(
      "FFmpeg/FFprobe not found. Install FFmpeg and add it to PATH, or reinstall the app with bundled binaries.",
    );
  }
  return { ffmpeg, ffprobe };
}

export function runProcess(
  bin: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error(`Timed out after ${timeoutMs}ms: ${path.basename(bin)}`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 8_000_000) stdout = stdout.slice(-4_000_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
