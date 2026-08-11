import { useMemo, useState } from "react";
import {
  transformCase,
  wrapLines,
  type CaseStyle,
  type WrapStyle,
} from "../shared/textTransforms";
import { useLocale } from "../i18n/LocaleContext";

const CASE_OPTIONS: { id: CaseStyle; label: string }[] = [
  { id: "upper", label: "UPPER" },
  { id: "lower", label: "lower" },
  { id: "title", label: "Title Case" },
  { id: "sentence", label: "Sentence" },
  { id: "snake", label: "snake_case" },
  { id: "kebab", label: "kebab-case" },
  { id: "camel", label: "camelCase" },
  { id: "pascal", label: "PascalCase" },
  { id: "constant", label: "CONSTANT_CASE" },
  { id: "dot", label: "dot.case" },
  { id: "path", label: "path/case" },
  { id: "invert", label: "iNVERT" },
];

const WRAP_SYMBOL_OPTIONS: { id: Exclude<WrapStyle, "none" | "custom">; label: string }[] = [
  { id: "quotes", label: "'…'" },
  { id: "double", label: '"…"' },
  { id: "backtick", label: "`…`" },
  { id: "paren", label: "(…)" },
  { id: "bracket", label: "[…]" },
  { id: "brace", label: "{…}" },
  { id: "angle", label: "<…>" },
];

export function TransformPage() {
  const { t } = useLocale();
  const [input, setInput] = useState("Hello World\nвторая строка");
  const [caseStyle, setCaseStyle] = useState<CaseStyle>("snake");
  const [wrapStyle, setWrapStyle] = useState<WrapStyle>("none");
  const [customLeft, setCustomLeft] = useState("|");
  const [customRight, setCustomRight] = useState("|");

  const output = useMemo(() => {
    const cased = transformCase(input, caseStyle);
    return wrapLines(cased, wrapStyle, customLeft, customRight);
  }, [input, caseStyle, wrapStyle, customLeft, customRight]);

  return (
    <div className="page">
      <div className="main-header">
        <div>
          <h2>{t("transform.title")}</h2>
          <p>{t("transform.lead")}</p>
        </div>
      </div>

      <div className="tool-block">
        <h3>{t("transform.caseStyle")}</h3>
        <div className="chip-grid">
          {CASE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`chip ${caseStyle === opt.id ? "chip-forward" : ""}`}
              onClick={() => setCaseStyle(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tool-block">
        <h3>{t("transform.wrap")}</h3>
        <div className="chip-grid">
          <button
            type="button"
            className={`chip ${wrapStyle === "none" ? "chip-reverse" : ""}`}
            onClick={() => setWrapStyle("none")}
          >
            {t("transform.none")}
          </button>
          {WRAP_SYMBOL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`chip ${wrapStyle === opt.id ? "chip-reverse" : ""}`}
              onClick={() => setWrapStyle(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${wrapStyle === "custom" ? "chip-reverse" : ""}`}
            onClick={() => setWrapStyle("custom")}
          >
            {t("transform.custom")}
          </button>
        </div>
        {wrapStyle === "custom" && (
          <div className="wrap-custom">
            <input
              value={customLeft}
              onChange={(e) => setCustomLeft(e.target.value)}
              placeholder={t("transform.left")}
              aria-label={t("transform.left")}
            />
            <span>…</span>
            <input
              value={customRight}
              onChange={(e) => setCustomRight(e.target.value)}
              placeholder={t("transform.right")}
              aria-label={t("transform.right")}
            />
          </div>
        )}
      </div>

      <div className="row-actions" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => void navigator.clipboard.writeText(output)}
        >
          {t("transform.copy")}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void window.transcribator.saveText("transformed.txt", output)}
        >
          {t("transform.save")}
        </button>
      </div>

      <div className="dual-panes">
        <label className="pane">
          <span className="pane-title">{t("transform.source")}</span>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
        </label>
        <label className="pane">
          <span className="pane-title">{t("transform.result")}</span>
          <textarea value={output} readOnly spellCheck={false} />
        </label>
      </div>
    </div>
  );
}
