import type { AppState, TranslitMode } from "../shared/types";
import { getPuntoPair } from "../shared/puntoPairs";
import { useLocale } from "../i18n/LocaleContext";

type Props = {
  state: AppState;
  forwardTitle?: string;
  reverseTitle?: string;
  undoHint?: string;
  onToggleMode: (target: "forward" | "reverse") => void;
  onSetMode: (mode: TranslitMode) => void;
  onSetModeOff: () => void;
  onTogglePunto: (target: "a2b" | "b2a" | "auto") => void;
  onSetPuntoOff: () => void;
};

function cycleTranslit(mode: TranslitMode): TranslitMode {
  if (mode === "off") return "forward";
  if (mode === "forward") return "reverse";
  return "off";
}

export function ModeStrip({
  state,
  forwardTitle,
  reverseTitle,
  undoHint,
  onToggleMode,
  onSetMode,
  onSetModeOff,
  onTogglePunto,
  onSetPuntoOff,
}: Props) {
  const { t } = useLocale();
  const pair = getPuntoPair(state.puntoPairId);
  const fwdTitle = forwardTitle ?? t("mode.forwardTitle");
  const revTitle = reverseTitle ?? t("mode.reverseTitle");
  const undoText = undoHint ?? t("mode.undoHint");

  const translitLabel =
    state.mode === "forward"
      ? t("mode.forward")
      : state.mode === "reverse"
        ? t("mode.reverse")
        : t("mode.off");

  const puntoLabel =
    state.puntoMode === "auto"
      ? t("mode.auto")
      : state.puntoMode === "a2b"
        ? pair.a2b.label
        : state.puntoMode === "b2a"
          ? pair.b2a.label
          : t("mode.off");

  const cyclePunto = () => {
    if (state.puntoMode === "off") onTogglePunto("auto");
    else if (state.puntoMode === "auto") onTogglePunto("a2b");
    else if (state.puntoMode === "a2b") onTogglePunto("b2a");
    else onSetPuntoOff();
  };

  return (
    <div className="mode-strip">
      <div className="mode-strip-group">
        <span className="mode-strip-label">{t("mode.translit")}</span>
        <button
          type="button"
          className={`chip chip-status ${
            state.mode === "forward"
              ? "chip-forward"
              : state.mode === "reverse"
                ? "chip-reverse"
                : "chip-off"
          }`}
          onClick={() => onSetMode(cycleTranslit(state.mode))}
          title={t("mode.clickCycleTranslit")}
        >
          <span className="chip-status-dot" />
          {translitLabel}
        </button>
        <button
          type="button"
          className={`chip ${state.mode === "forward" ? "chip-forward" : ""}`}
          onClick={() => onToggleMode("forward")}
          title={fwdTitle}
        >
          {t("mode.forward")}
        </button>
        <button
          type="button"
          className={`chip ${state.mode === "reverse" ? "chip-reverse" : ""}`}
          onClick={() => onToggleMode("reverse")}
          title={revTitle}
        >
          {t("mode.reverse")}
        </button>
        <button
          type="button"
          className={`chip ${state.mode === "off" ? "chip-off" : ""}`}
          onClick={onSetModeOff}
        >
          {t("mode.off")}
        </button>
      </div>
      <div className="mode-strip-group">
        <span className="mode-strip-label">
          {t("mode.punto")} · {pair.short}
        </span>
        <button
          type="button"
          className={`chip chip-status ${
            state.puntoMode === "auto"
              ? "chip-forward"
              : state.puntoMode === "a2b"
                ? "chip-forward"
                : state.puntoMode === "b2a"
                  ? "chip-reverse"
                  : "chip-off"
          }`}
          onClick={cyclePunto}
          title={t("mode.clickCyclePunto")}
        >
          <span className="chip-status-dot" />
          {puntoLabel}
        </button>
        <button
          type="button"
          className={`chip ${state.puntoMode === "auto" ? "chip-forward" : ""}`}
          onClick={() => onTogglePunto("auto")}
          title={t("mode.puntoAutoHint")}
        >
          {t("mode.auto")}
        </button>
        <button
          type="button"
          className={`chip ${state.puntoMode === "a2b" ? "chip-forward" : ""}`}
          onClick={() => onTogglePunto("a2b")}
          title={pair.a2b.hint}
        >
          {pair.a2b.label}
        </button>
        <button
          type="button"
          className={`chip ${state.puntoMode === "b2a" ? "chip-reverse" : ""}`}
          onClick={() => onTogglePunto("b2a")}
          title={pair.b2a.hint}
        >
          {pair.b2a.label}
        </button>
      </div>
      <div className="mode-strip-meta">
        <span className={`dot ${state.hookActive ? "ok" : "bad"}`} />
        {state.hookActive ? t("mode.hookOk") : t("mode.hookBad")}
        <span className="mode-strip-sep">·</span>
        <span title={undoText}>{undoText}</span>
      </div>
    </div>
  );
}
