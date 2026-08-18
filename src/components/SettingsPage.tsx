import { useEffect, useState } from "react";
import type { AppState, HotkeysConfig, UpdatePrefs } from "../shared/types";
import {
  DEFAULT_HOTKEYS,
  displayKey,
  formatChordLabel,
  hotkeyFromKeyboardEvent,
} from "../shared/hotkeys";
import { useLocale } from "../i18n/LocaleContext";
import type { LocaleId } from "../shared/i18n";
import { UpdatePanel } from "./UpdatePanel";

type Props = {
  state: AppState;
  onLocaleChange: (locale: LocaleId) => void;
  onLaunchAtLogin: (enabled: boolean) => void;
  onHotkeysChange: (hotkeys: HotkeysConfig) => void;
  onUpdatePrefsChange: (prefs: UpdatePrefs) => void;
  onOpenAccessibility: () => void;
};

type CaptureTarget = "chordFirst" | "chordSecond" | null;

export function SettingsPage({
  state,
  onLocaleChange,
  onLaunchAtLogin,
  onHotkeysChange,
  onUpdatePrefsChange,
  onOpenAccessibility,
}: Props) {
  const { t, locale, locales, nativeName } = useLocale();
  const [draft, setDraft] = useState<HotkeysConfig>(state.hotkeys ?? DEFAULT_HOTKEYS);
  const [capturing, setCapturing] = useState<CaptureTarget>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(state.hotkeys ?? DEFAULT_HOTKEYS);
  }, [state.hotkeys]);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const name = hotkeyFromKeyboardEvent(e);
      if (!name) return;
      setDraft((prev) => {
        const next = { ...prev, [capturing]: name };
        if (capturing === "chordFirst" && name === next.chordSecond) {
          setError(t("settings.hotkeysSame"));
          return prev;
        }
        if (capturing === "chordSecond" && name === next.chordFirst) {
          setError(t("settings.hotkeysSame"));
          return prev;
        }
        setError(null);
        return next;
      });
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, t]);

  const saveHotkeys = () => {
    if (draft.chordFirst === draft.chordSecond) {
      setError(t("settings.hotkeysSame"));
      return;
    }
    setError(null);
    onHotkeysChange(draft);
  };

  const resetHotkeys = () => {
    setDraft({ ...DEFAULT_HOTKEYS });
    setError(null);
    onHotkeysChange({ ...DEFAULT_HOTKEYS });
  };

  const forwardLabel = formatChordLabel(draft.chordFirst, draft.chordSecond);
  const reverseLabel = formatChordLabel(draft.chordSecond, draft.chordFirst);

  return (
    <div className="page">
      <div className="main-header">
        <div>
          <h2>{t("settings.title")}</h2>
          <p>{t("settings.lead")}</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="editor-card settings-card">
          <h3>{t("settings.general")}</h3>
          <label className="check-row settings-row">
            <span>{t("app.language")}</span>
            <select
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as LocaleId)}
            >
              {locales.map((id) => (
                <option key={id} value={id}>
                  {nativeName(id)}
                </option>
              ))}
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.launchAtLogin}
              onChange={(e) => onLaunchAtLogin(e.target.checked)}
            />
            {t("status.launchAtLogin")}
          </label>
          <div className="settings-row">
            <span className="pane-title">
              {t("status.hook", {
                state: state.hookActive ? t("status.hookActive") : t("status.hookInactive"),
              })}
            </span>
            {!state.hookActive && (
              <button type="button" className="btn" onClick={onOpenAccessibility}>
                {t("status.access")}
              </button>
            )}
          </div>
        </section>

        <UpdatePanel
          prefs={state.updatePrefs ?? { provider: "github", url: "" }}
          onPrefsChange={onUpdatePrefsChange}
        />

        <section className="editor-card settings-card">
          <h3>{t("settings.hotkeys")}</h3>
          <p className="hint">{t("settings.hotkeysHint")}</p>

          <div className="hotkey-row">
            <span className="pane-title">{t("settings.chordFirst")}</span>
            <button
              type="button"
              className={`btn hotkey-capture ${capturing === "chordFirst" ? "primary" : ""}`}
              onClick={() => setCapturing("chordFirst")}
            >
              {capturing === "chordFirst"
                ? t("settings.pressKey")
                : displayKey(draft.chordFirst)}
            </button>
          </div>
          <div className="hotkey-row">
            <span className="pane-title">{t("settings.chordSecond")}</span>
            <button
              type="button"
              className={`btn hotkey-capture ${capturing === "chordSecond" ? "primary" : ""}`}
              onClick={() => setCapturing("chordSecond")}
            >
              {capturing === "chordSecond"
                ? t("settings.pressKey")
                : displayKey(draft.chordSecond)}
            </button>
          </div>

          <div className="hotkey-preview">
            <div>
              <span className="hint">{t("settings.forwardChord")}</span>
              <kbd>{forwardLabel}</kbd>
            </div>
            <div>
              <span className="hint">{t("settings.reverseChord")}</span>
              <kbd>{reverseLabel}</kbd>
            </div>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.undoEnabled}
              onChange={(e) => setDraft((p) => ({ ...p, undoEnabled: e.target.checked }))}
            />
            {t("settings.undoEnabled")}
          </label>

          <label className="settings-row">
            <span className="pane-title">{t("settings.undoMs")}</span>
            <input
              type="number"
              min={150}
              max={2000}
              step={50}
              value={draft.undoDoubleCtrlMs}
              disabled={!draft.undoEnabled}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  undoDoubleCtrlMs: Number(e.target.value) || DEFAULT_HOTKEYS.undoDoubleCtrlMs,
                }))
              }
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <div className="row-actions">
            <button type="button" className="btn primary" onClick={saveHotkeys}>
              {t("settings.saveHotkeys")}
            </button>
            <button type="button" className="btn" onClick={resetHotkeys}>
              {t("settings.resetHotkeys")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
