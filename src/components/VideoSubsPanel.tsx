import { useMemo, useState } from "react";
import { isVideoFileName } from "../shared/videoFormats";
import { useLocale } from "../i18n/LocaleContext";

type SubtitleTrack = {
  streamIndex: number;
  subtitleIndex: number;
  codec: string;
  language: string;
  title: string;
  isText: boolean;
};

type ProbedVideo = {
  path: string;
  name: string;
  tracks: SubtitleTrack[];
};

type ExtractSelection =
  | { mode: "all" }
  | { mode: "subtitleIndex"; subtitleIndex: number }
  | { mode: "language"; language: string };

type TrackOption =
  | { kind: "language"; language: string; label: string }
  | { kind: "index"; subtitleIndex: number; label: string };

type LogLine = { kind: "ok" | "warn" | "err"; text: string };

function electronPath(file: File): string | null {
  const p = (file as File & { path?: string }).path;
  return typeof p === "string" && p.length > 0 ? p : null;
}

function trackLabel(t: SubtitleTrack, indexLabel: string): string {
  const bits = [indexLabel];
  if (t.language) bits.push(t.language);
  bits.push(t.codec);
  if (t.title) bits.push(`"${t.title}"`);
  if (!t.isText) bits.push("[image]");
  return bits.join(" · ");
}

export function VideoSubsPanel() {
  const { t } = useLocale();
  const [videos, setVideos] = useState<ProbedVideo[]>([]);
  const [selectionMode, setSelectionMode] = useState<"all" | "track">("all");
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const trackOptions = useMemo(() => {
    const options: TrackOption[] = [];
    const langs = new Set<string>();
    let maxIndex = -1;
    for (const v of videos) {
      for (const tr of v.tracks) {
        if (!tr.isText) continue;
        if (tr.language) langs.add(tr.language);
        if (tr.subtitleIndex > maxIndex) maxIndex = tr.subtitleIndex;
      }
    }
    for (const language of [...langs].sort()) {
      options.push({
        kind: "language",
        language,
        label: t("convert.videoLangOption", { lang: language }),
      });
    }
    for (let i = 0; i <= maxIndex; i += 1) {
      options.push({
        kind: "index",
        subtitleIndex: i,
        label: t("convert.videoIndexOption", { n: String(i) }),
      });
    }
    return options;
  }, [videos, t]);

  const mergeProbed = (next: ProbedVideo[]) => {
    setVideos((prev) => {
      const byPath = new Map(prev.map((v) => [v.path, v]));
      for (const v of next) byPath.set(v.path, v);
      return [...byPath.values()];
    });
    setSelectedOption((cur) => {
      if (cur) return cur;
      const firstLang = next
        .flatMap((v) => v.tracks)
        .find((tr) => tr.isText && tr.language)?.language;
      if (firstLang) return `lang:${firstLang}`;
      const first = next.flatMap((v) => v.tracks).find((tr) => tr.isText);
      return first ? `idx:${first.subtitleIndex}` : "";
    });
  };

  const probePaths = async (paths: string[]) => {
    const videoPaths = paths.filter((p) => isVideoFileName(p));
    if (videoPaths.length === 0) {
      setError(t("convert.videoNeedVideo"));
      return;
    }
    setError(null);
    setBusy(true);
    setLog([]);
    try {
      const result = await window.transcribator.probeVideoSubtitles(videoPaths);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      mergeProbed(result.videos);
      if (result.videos.every((v) => v.tracks.length === 0)) {
        setLog([{ kind: "warn", text: t("convert.videoNoTracks") }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickVideos = async () => {
    setError(null);
    try {
      const result = await window.transcribator.openVideos();
      if (!result.ok) {
        if (!result.canceled) setError(result.error);
        return;
      }
      await probePaths(result.paths);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDropFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const paths: string[] = [];
    for (const f of list) {
      const p = electronPath(f);
      if (p) paths.push(p);
    }
    if (paths.length === 0) {
      setError(t("convert.videoDropNeedPath"));
      return;
    }
    await probePaths(paths);
  };

  const buildSelection = (): ExtractSelection | null => {
    if (selectionMode === "all") return { mode: "all" };
    if (!selectedOption) return null;
    if (selectedOption.startsWith("lang:")) {
      return { mode: "language", language: selectedOption.slice(5) };
    }
    if (selectedOption.startsWith("idx:")) {
      return { mode: "subtitleIndex", subtitleIndex: Number(selectedOption.slice(4)) };
    }
    return null;
  };

  const extract = async () => {
    if (videos.length === 0) return;
    const selection = buildSelection();
    if (!selection) {
      setError(t("convert.videoSelectTrack"));
      return;
    }

    setError(null);
    setBusy(true);
    setLog([]);
    try {
      const result = await window.transcribator.extractSubtitles(
        videos.map((v) => v.path),
        selection,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const lines: LogLine[] = [];
      let saved = 0;
      for (const item of result.results) {
        if (item.error) {
          lines.push({
            kind: "err",
            text: t("convert.videoError", { video: item.videoName, error: item.error }),
          });
        }
        for (const f of item.files) {
          saved += 1;
          lines.push({
            kind: "ok",
            text: t("convert.videoSaved", { video: item.videoName, file: f.outName }),
          });
        }
        for (const s of item.skipped) {
          lines.push({
            kind: "warn",
            text: t("convert.videoSkipped", {
              n: String(s.streamIndex),
              reason: s.reason,
            }),
          });
        }
      }
      lines.unshift({
        kind: "ok",
        text: t("convert.videoDone", { count: String(saved) }),
      });
      setLog(lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="video-subs-panel">
      <div className="tool-block ass-options">
        <div className="row-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void pickVideos()}>
            {busy ? t("convert.loading") : t("convert.videoPick")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || videos.length === 0}
            onClick={() => void extract()}
          >
            {busy ? t("convert.videoExtracting") : t("convert.videoExtract")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || videos.length === 0}
            onClick={() => {
              setVideos([]);
              setLog([]);
              setSelectedOption("");
              setError(null);
            }}
          >
            {t("convert.videoClear")}
          </button>
        </div>

        <div className="row-actions" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <label className="check-row">
            <input
              type="radio"
              name="subs-sel"
              checked={selectionMode === "all"}
              onChange={() => setSelectionMode("all")}
            />
            {t("convert.videoAllTracks")}
          </label>
          <label className="check-row">
            <input
              type="radio"
              name="subs-sel"
              checked={selectionMode === "track"}
              onChange={() => setSelectionMode("track")}
            />
            {t("convert.videoSpecificTrack")}
          </label>
          {selectionMode === "track" && (
            <select
              className="video-track-select"
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              disabled={trackOptions.length === 0}
            >
              <option value="">{t("convert.videoSelectTrack")}</option>
              {trackOptions.map((opt) => {
                const value =
                  opt.kind === "language" ? `lang:${opt.language}` : `idx:${opt.subtitleIndex}`;
                return (
                  <option key={value} value={value}>
                    {opt.label}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div
        className={`convert-dropzone ${dragOver ? "is-dragover" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void onDropFiles(e.dataTransfer.files);
        }}
      >
        {busy && (
          <div className="convert-busy-overlay" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>{t("convert.loading")}</span>
          </div>
        )}
        <p className="hint convert-drop-hint">
          {busy ? t("convert.dropBusy") : t("convert.videoDropHint")}
        </p>

        {videos.length === 0 ? (
          <p className="hint">{t("convert.videoNoVideos")}</p>
        ) : (
          <ul className="video-subs-list">
            {videos.map((v) => (
              <li key={v.path} className="video-subs-item">
                <div className="video-subs-name">{v.name}</div>
                <div className="hint">
                  {v.tracks.length === 0
                    ? t("convert.videoNoTracks")
                    : v.tracks
                        .map((tr) =>
                          trackLabel(
                            tr,
                            t("convert.videoTrackIndex", { n: String(tr.subtitleIndex) }),
                          ),
                        )
                        .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}

        {log.length > 0 && (
          <div className="video-subs-log" aria-live="polite">
            {log.map((line, i) => (
              <p key={`${i}-${line.text}`} className={`video-log-${line.kind}`}>
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
