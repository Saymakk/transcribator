import { useEffect, useMemo, useState } from "react";
import type { AppState, PuntoDictEntry, PuntoPairId } from "../shared/types";
import { puntoConvert, type PuntoDirection } from "../shared/punto";
import { getPuntoPair, PUNTO_PAIRS } from "../shared/puntoPairs";
import { loadDictPacks, mergeDictionaries } from "../shared/dicts/load";
import { useLocale } from "../i18n/LocaleContext";

type Props = {
  state: AppState;
  onTogglePunto: (target: "a2b" | "b2a" | "auto") => void;
  onSetPuntoOff: () => void;
  onSetPair: (id: PuntoPairId) => Promise<void>;
  onSaveDictionary: (entries: PuntoDictEntry[]) => Promise<void>;
};

export function PuntoPage({
  state,
  onTogglePunto,
  onSetPuntoOff,
  onSetPair,
  onSaveDictionary,
}: Props) {
  const { t, locale } = useLocale();
  const pair = getPuntoPair(state.puntoPairId);
  const [input, setInput] = useState("ghbdtn");
  const [manualDir, setManualDir] = useState<"a2b" | "b2a" | "auto">("auto");
  const [dictDraft, setDictDraft] = useState<PuntoDictEntry[]>(() =>
    structuredClone(state.puntoDictionary),
  );
  const [dictDirty, setDictDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packEntries, setPackEntries] = useState<PuntoDictEntry[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);

  useEffect(() => {
    if (!dictDirty) setDictDraft(structuredClone(state.puntoDictionary));
  }, [state.puntoDictionary, dictDirty]);

  useEffect(() => {
    let cancelled = false;
    setPacksLoading(true);
    void loadDictPacks(pair.packIds).then((entries) => {
      if (!cancelled) {
        setPackEntries(entries);
        setPacksLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pair.packIds]);

  const effectiveDict = useMemo(
    () => mergeDictionaries(packEntries, dictDraft),
    [packEntries, dictDraft],
  );

  const resolvedSide: "a2b" | "b2a" = useMemo(() => {
    if (manualDir !== "auto") return manualDir;
    if (state.puntoMode === "a2b" || state.puntoMode === "b2a") return state.puntoMode;
    // auto: layout pairs guess by alphabet; dict pairs default to a2b
    if (pair.engine === "dict") return "a2b";
    const hasCyr = /[а-яёА-ЯЁ]/.test(input);
    return hasCyr ? "b2a" : "a2b";
  }, [manualDir, state.puntoMode, pair.engine, input]);

  const layoutDir: PuntoDirection =
    resolvedSide === "a2b" ? pair.a2b.layoutDir : pair.b2a.layoutDir;

  const output = useMemo(
    () => puntoConvert(input, layoutDir, effectiveDict, pair.engine),
    [input, layoutDir, effectiveDict, pair.engine],
  );

  const updateEntry = (index: number, field: "from" | "to", value: string) => {
    setDictDraft((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
    setDictDirty(true);
  };

  const saveDict = async () => {
    setSaving(true);
    try {
      await onSaveDictionary(dictDraft);
      setDictDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="main-header">
        <div>
          <h2>{t("punto.title")}</h2>
          <p>{t("punto.lead")}</p>
        </div>
      </div>

      <div className="tool-block">
        <h3>{t("punto.pair")}</h3>
        <div className="chip-grid">
          {PUNTO_PAIRS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${state.puntoPairId === p.id ? "chip-forward" : ""}`}
              onClick={() => void onSetPair(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {t("punto.current", { label: pair.label })}
          {packsLoading
            ? ` · ${t("punto.loadingDict")}`
            : ` · ${t("punto.dictWords", { n: packEntries.length.toLocaleString(locale) })}`}
        </p>
      </div>

      <div className="panel inline-panel">
        <h3 className="panel-inline-title">{t("punto.live")}</h3>
        <p className="hint" style={{ marginBottom: 8 }}>
          {state.puntoMode === "auto"
            ? t("mode.puntoAutoHint")
            : state.puntoMode === "a2b"
              ? pair.a2b.hint
              : state.puntoMode === "b2a"
                ? pair.b2a.hint
                : t("punto.liveHintOff")}
        </p>
        <div className="row-actions">
          <button
            type="button"
            className={`btn ${state.puntoMode === "auto" ? "active-forward" : ""}`}
            onClick={() => onTogglePunto("auto")}
            title={t("mode.puntoAutoHint")}
          >
            {t("mode.auto")}
          </button>
          <button
            type="button"
            className={`btn ${state.puntoMode === "a2b" ? "active-forward" : ""}`}
            onClick={() => onTogglePunto("a2b")}
            title={pair.a2b.hint}
          >
            {pair.a2b.label}
          </button>
          <button
            type="button"
            className={`btn ${state.puntoMode === "b2a" ? "active-reverse" : ""}`}
            onClick={() => onTogglePunto("b2a")}
            title={pair.b2a.hint}
          >
            {pair.b2a.label}
          </button>
          <button
            type="button"
            className={`btn ${state.puntoMode === "off" ? "active-off" : ""}`}
            onClick={onSetPuntoOff}
          >
            {t("punto.off")}
          </button>
        </div>
      </div>

      <div className="tool-block">
        <div className="rules-toolbar">
          <h3>{t("punto.dictionary")}</h3>
          <span className="rules-count">{dictDraft.length}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setDictDraft((prev) => [...prev, { from: "", to: "" }]);
              setDictDirty(true);
            }}
          >
            {t("punto.add")}
          </button>
          <button
            type="button"
            className="btn btn-sm primary"
            disabled={!dictDirty || saving}
            onClick={() => void saveDict()}
          >
            {saving ? "…" : t("punto.saveDict")}
          </button>
        </div>
        <p className="hint">{t("punto.dictHint")}</p>
        <div className="rules-table-wrap">
          {dictDraft.length === 0 ? (
            <p className="rules-empty">{t("layouts.emptyRules")}</p>
          ) : (
            <div className="rules">
              {dictDraft.map((entry, index) => (
                <div className="rule-row" key={index}>
                  <input
                    className="rule-input"
                    value={entry.from}
                    placeholder={t("punto.from")}
                    onChange={(e) => updateEntry(index, "from", e.target.value)}
                  />
                  <span className="arrow">→</span>
                  <input
                    className="rule-input"
                    value={entry.to}
                    placeholder={t("punto.to")}
                    onChange={(e) => updateEntry(index, "to", e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() => {
                      setDictDraft((prev) => prev.filter((_, i) => i !== index));
                      setDictDirty(true);
                    }}
                    aria-label={t("layouts.deleteRuleAria")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tool-block">
        <h3>{t("punto.preview")}</h3>
        <div className="tool-toolbar">
          <div className="row-actions">
            <span className="mode-strip-label">{t("punto.direction")}</span>
            <button
              type="button"
              className={`btn ${manualDir === "auto" ? "primary" : ""}`}
              onClick={() => setManualDir("auto")}
            >
              {t("punto.auto")}
            </button>
            <button
              type="button"
              className={`btn ${manualDir === "a2b" ? "active-forward" : ""}`}
              onClick={() => setManualDir("a2b")}
            >
              {pair.a2b.label}
            </button>
            <button
              type="button"
              className={`btn ${manualDir === "b2a" ? "active-reverse" : ""}`}
              onClick={() => setManualDir("b2a")}
            >
              {pair.b2a.label}
            </button>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(output)}
            >
              {t("punto.copy")}
            </button>
          </div>
        </div>

        <div className="dual-panes">
          <label className="pane">
            <span className="pane-title">{t("punto.source")}</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder={pair.a2b.hint}
            />
          </label>
          <label className="pane">
            <span className="pane-title">{t("punto.result")}</span>
            <textarea value={output} readOnly spellCheck={false} />
          </label>
        </div>
      </div>
    </div>
  );
}
