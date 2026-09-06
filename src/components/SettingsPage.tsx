import type { AppState, UpdatePrefs } from "../shared/types";
import { useLocale } from "../i18n/LocaleContext";
import type { LocaleId } from "../shared/i18n";
import { UpdatePanel } from "./UpdatePanel";

type Props = {
  state: AppState;
  onLocaleChange: (locale: LocaleId) => void;
  onLaunchAtLogin: (enabled: boolean) => void;
  onUpdatePrefsChange: (prefs: UpdatePrefs) => void;
  onOpenAccessibility: () => void;
};

export function SettingsPage({
  state,
  onLocaleChange,
  onLaunchAtLogin,
  onUpdatePrefsChange,
  onOpenAccessibility,
}: Props) {
  const { t, locale, locales, nativeName } = useLocale();

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
      </div>
    </div>
  );
}
