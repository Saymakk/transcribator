import fs from "node:fs";
import path from "node:path";
import { assertMediaTools, runProcess } from "./ffmpegBins";

export type SubtitleTrack = {
  /** Absolute stream index in the container (for -map 0:N). */
  streamIndex: number;
  /** Index among subtitle streams only (0-based). */
  subtitleIndex: number;
  codec: string;
  language: string;
  title: string;
  /** True when the track is text-based and can be saved as .srt/.ass/.vtt. */
  isText: boolean;
};

export type ProbedVideo = {
  path: string;
  name: string;
  tracks: SubtitleTrack[];
};

export type ExtractSelection =
  | { mode: "all" }
  | { mode: "track"; streamIndex: number }
  | { mode: "subtitleIndex"; subtitleIndex: number }
  | { mode: "language"; language: string };

export type ExtractedFile = {
  videoPath: string;
  videoName: string;
  outPath: string;
  outName: string;
  streamIndex: number;
  language: string;
};

export type ExtractVideoResult = {
  videoPath: string;
  videoName: string;
  files: ExtractedFile[];
  skipped: Array<{ streamIndex: number; reason: string }>;
  error?: string;
};

type FfprobeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
};

const IMAGE_CODECS = new Set([
  "hdmv_pgs_subtitle",
  "dvd_subtitle",
  "dvdsub",
  "pgssub",
  "xsub",
  "dvb_subtitle",
]);

function tagLang(tags?: Record<string, string>): string {
  if (!tags) return "";
  return (tags.language || tags.LANGUAGE || tags.lang || "").trim().toLowerCase();
}

function tagTitle(tags?: Record<string, string>): string {
  if (!tags) return "";
  return (tags.title || tags.TITLE || "").trim();
}

function isTextCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  if (!c || c === "unknown") return false;
  if (IMAGE_CODECS.has(c)) return false;
  return true;
}

function preferredExt(codec: string): string {
  const c = codec.toLowerCase();
  if (c === "ass" || c === "ssa") return "ass";
  if (c === "webvtt" || c === "wvtt") return "vtt";
  if (c === "subrip" || c === "srt") return "srt";
  return "srt";
}

function safeToken(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned || fallback;
}

function uniqueOutPath(dir: string, base: string, ext: string): string {
  let candidate = path.join(dir, `${base}.${ext}`);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base}.${i}.${ext}`))) i += 1;
  return path.join(dir, `${base}.${i}.${ext}`);
}

export async function probeVideoSubtitles(videoPath: string): Promise<ProbedVideo> {
  const { ffprobe } = assertMediaTools();
  const resolved = path.resolve(videoPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const { code, stdout, stderr } = await runProcess(
    ffprobe,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-select_streams",
      "s",
      resolved,
    ],
    { timeoutMs: 60_000 },
  );

  if (code !== 0) {
    throw new Error(stderr.trim() || `ffprobe failed (${code})`);
  }

  let parsed: { streams?: FfprobeStream[] } = {};
  try {
    parsed = JSON.parse(stdout || "{}") as { streams?: FfprobeStream[] };
  } catch {
    throw new Error("ffprobe returned invalid JSON");
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const tracks: SubtitleTrack[] = [];
  let subtitleIndex = 0;
  for (const s of streams) {
    if ((s.codec_type || "").toLowerCase() !== "subtitle") continue;
    const streamIndex = typeof s.index === "number" ? s.index : -1;
    if (streamIndex < 0) continue;
    const codec = (s.codec_name || "unknown").toLowerCase();
    tracks.push({
      streamIndex,
      subtitleIndex,
      codec,
      language: tagLang(s.tags),
      title: tagTitle(s.tags),
      isText: isTextCodec(codec),
    });
    subtitleIndex += 1;
  }

  return {
    path: resolved,
    name: path.basename(resolved),
    tracks,
  };
}

function selectTracks(tracks: SubtitleTrack[], selection: ExtractSelection): SubtitleTrack[] {
  const textTracks = tracks.filter((t) => t.isText);
  if (selection.mode === "all") return textTracks;
  if (selection.mode === "track") {
    return textTracks.filter((t) => t.streamIndex === selection.streamIndex);
  }
  if (selection.mode === "subtitleIndex") {
    return textTracks.filter((t) => t.subtitleIndex === selection.subtitleIndex);
  }
  const lang = selection.language.trim().toLowerCase();
  return textTracks.filter((t) => t.language === lang);
}

async function extractOneTrack(
  ffmpeg: string,
  videoPath: string,
  track: SubtitleTrack,
): Promise<ExtractedFile> {
  const dir = path.dirname(videoPath);
  const stem = path.basename(videoPath, path.extname(videoPath));
  const lang = safeToken(track.language, "");
  const title = safeToken(track.title, "");
  const bits = [stem];
  if (lang) bits.push(lang);
  else if (title) bits.push(title);
  else bits.push(`track${track.subtitleIndex}`);
  const base = bits.join(".");
  const ext = preferredExt(track.codec);
  const outPath = uniqueOutPath(dir, base, ext);

  const mapArg = `0:${track.streamIndex}`;
  const args =
    ext === "ass" || (track.codec === "ass" || track.codec === "ssa")
      ? ["-y", "-i", videoPath, "-map", mapArg, "-c", "copy", outPath]
      : ext === "vtt"
        ? ["-y", "-i", videoPath, "-map", mapArg, "-c:s", "webvtt", outPath]
        : ["-y", "-i", videoPath, "-map", mapArg, "-c:s", "srt", outPath];

  const { code, stderr } = await runProcess(ffmpeg, args, { timeoutMs: 180_000 });
  if (code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(stderr.trim().split("\n").slice(-4).join(" ") || `ffmpeg failed (${code})`);
  }

  return {
    videoPath,
    videoName: path.basename(videoPath),
    outPath,
    outName: path.basename(outPath),
    streamIndex: track.streamIndex,
    language: track.language,
  };
}

export async function extractSubtitlesFromVideo(
  videoPath: string,
  selection: ExtractSelection,
): Promise<ExtractVideoResult> {
  const { ffmpeg } = assertMediaTools();
  const probed = await probeVideoSubtitles(videoPath);
  const chosen = selectTracks(probed.tracks, selection);
  const skipped = probed.tracks
    .filter((t) => !t.isText)
    .map((t) => ({
      streamIndex: t.streamIndex,
      reason: `Image-based subtitle (${t.codec}) cannot be saved as text`,
    }));

  if (chosen.length === 0) {
    return {
      videoPath: probed.path,
      videoName: probed.name,
      files: [],
      skipped,
      error:
        selection.mode === "all"
          ? probed.tracks.length === 0
            ? "No subtitle tracks found"
            : "No text subtitle tracks found"
          : "Selected subtitle track not found or is not text-based",
    };
  }

  const files: ExtractedFile[] = [];
  for (const track of chosen) {
    files.push(await extractOneTrack(ffmpeg, probed.path, track));
  }

  return {
    videoPath: probed.path,
    videoName: probed.name,
    files,
    skipped,
  };
}

export async function extractSubtitlesFromVideos(
  videoPaths: string[],
  selection: ExtractSelection,
): Promise<ExtractVideoResult[]> {
  const results: ExtractVideoResult[] = [];
  for (const videoPath of videoPaths) {
    try {
      results.push(await extractSubtitlesFromVideo(videoPath, selection));
    } catch (error) {
      results.push({
        videoPath,
        videoName: path.basename(videoPath),
        files: [],
        skipped: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
