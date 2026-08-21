import { useEffect, useState } from "react";
import type { UpdatePrefs } from "../shared/updateFeed";
import { useLocale } from "../i18n/LocaleContext";

export type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; releaseNotes?: string | null }
  | { status: "not-available"; version: string }
  | { status: "downloading"; percent: number }
  | { status: "paused"; version: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string }
  | { status: "disabled"; reason: string };

type Props = {
  compact?: boolean;
  prefs: UpdatePrefs;
  onPrefsChange: (prefs: UpdatePrefs) => void;
};

export function UpdatePanel({ compact = false, prefs, onPrefsChange }: Props) {
  const { t } = useLocale();
  const [status, setStatus] = useState<UpdateStatus>({ status: "idle" });
  const [appVersion, setAppVersion] = useState("");
  const [draftUrl, setDraftUrl] = useState(prefs.url);

  useEffect(() => {
    setDraftUrl(prefs.url);
  }, [prefs.url]);

  useEffect(() => {
    void window.transcribator.getAppVersion().then(setAppVersion);
    void window.transcribator.getUpdateStatus().then(setStatus);
    return window.transcribator.onUpdateStatus(setStatus);
  }, []);

  const check = () => {
    void window.transcribator.checkForUpdates();
  };

  const install = () => {
    void window.transcribator.installUpdate();
  };

  const pause = () => {
    void window.transcribator.pauseUpdateDownload();
  };

  const resume = () => {
    void window.transcribator.resumeUpdateDownload();
  };

  const saveFeed = () => {
    onPrefsChange({
      provider: prefs.provider,
      url: draftUrl.trim(),
    });
  };

  let body: string = t("update.idle");
  if (status.status === "disabled") body = t("update.disabledDev");
  else if (status.status === "checking") body = t("update.checking");
  else if (status.status === "available")
    body = t("update.available", { version: status.version });
  else if (status.status === "not-available")
    body = t("update.upToDate", { version: status.version });
  else if (status.status === "downloading")
    body = t("update.downloading", { percent: Math.round(status.percent) });
  else if (status.status === "paused")
    body = t("update.paused", {
      version: status.version,
      percent: Math.round(status.percent),
    });
  else if (status.status === "downloaded")
    body = t("update.downloaded", { version: status.version });
  else if (status.status === "error") body = t("update.error", { message: status.message });

  const progressPercent =
    status.status === "downloading" || status.status === "paused" ? status.percent : 0;

  return (
    <section className={`editor-card settings-card ${compact ? "update-compact" : ""}`}>
      {!compact && <h3>{t("update.title")}</h3>}
      <p className="hint">
        {t("update.version", { version: appVersion || "…" })} · {body}
      </p>
      {(status.status === "downloading" || status.status === "paused") && (
        <div
          className={`update-progress${status.status === "paused" ? " is-paused" : ""}`}
          aria-hidden
        >
          <div style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} />
        </div>
      )}

      <label className="check-row settings-row">
        <span>{t("update.source")}</span>
        <select
          value={prefs.provider}
          onChange={(e) => {
            const provider = e.target.value === "generic" ? "generic" : "github";
            onPrefsChange({
              provider,
              url: provider === "github" ? prefs.url : draftUrl.trim() || prefs.url,
            });
          }}
        >
          <option value="github">{t("update.sourceGithub")}</option>
          <option value="generic">{t("update.sourceCustom")}</option>
        </select>
      </label>

      {prefs.provider === "generic" && (
        <>
          <p className="hint">{t("update.feedHint")}</p>
          <label className="settings-row">
            <span className="pane-title">{t("update.feedUrl")}</span>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://disk.yandex.ru/d/…"
              spellCheck={false}
            />
          </label>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              onClick={saveFeed}
              disabled={draftUrl.trim() === prefs.url}
            >
              {t("update.feedSave")}
            </button>
          </div>
        </>
      )}

      <p className="hint">{t("update.deltaHint")}</p>

      <div className="row-actions">
        <button
          type="button"
          className="btn"
          onClick={check}
          disabled={
            status.status === "checking" ||
            status.status === "downloading" ||
            status.status === "paused"
          }
        >
          {t("update.check")}
        </button>
        {status.status === "available" && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void window.transcribator.downloadAndInstallUpdate()}
          >
            {t("update.downloadInstall")}
          </button>
        )}
        {status.status === "downloading" && (
          <button type="button" className="btn" onClick={pause}>
            {t("update.pause")}
          </button>
        )}
        {status.status === "paused" && (
          <button type="button" className="btn primary" onClick={resume}>
            {t("update.resume")}
          </button>
        )}
        {status.status === "downloaded" && (
          <button type="button" className="btn primary" onClick={install}>
            {t("update.install")}
          </button>
        )}
      </div>
    </section>
  );
}
