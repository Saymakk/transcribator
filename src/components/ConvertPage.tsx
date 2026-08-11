import { useEffect, useMemo, useState } from "react";
import type { Layout } from "../shared/types";
import { transliterateLettersOnly } from "../shared/convert";
import { formatSupportHint, isSupportedDocument } from "../shared/documentFormats";
import {
  assToSrt,
  defaultSelectedFields,
  looksLikeAss,
  parseAss,
} from "../shared/assToSrt";
import { useLocale } from "../i18n/LocaleContext";

type Props = {
  layout: Layout;
};

type ConvertMode = "translit" | "ass-srt";

export function ConvertPage({ layout }: Props) {
  const { t } = useLocale();
  const [mode, setMode] = useState<ConvertMode>("translit");
  const [input, setInput] = useState("");
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [assFields, setAssFields] = useState<string[]>([]);
  const [assSeparator, setAssSeparator] = useState(". ");
  const [assKeepEmpty, setAssKeepEmpty] = useState(false);

  const assParsed = useMemo(() => (input.trim() ? parseAss(input) : null), [input]);
  const formatColumns = assParsed?.formatColumns ?? [];

  // When Format columns from the file change, keep selection in sync with available names.
  useEffect(() => {
    if (formatColumns.length === 0) {
      setAssFields([]);
      return;
    }
    setAssFields((prev) => {
      const stillValid = prev.filter((f) =>
        formatColumns.some((c) => c.toLowerCase() === f.toLowerCase()),
      );
      if (stillValid.length > 0) {
        // Remap to exact casing from Format
        return stillValid.map(
          (f) => formatColumns.find((c) => c.toLowerCase() === f.toLowerCase()) ?? f,
        );
      }
      return defaultSelectedFields(formatColumns);
    });
  }, [formatColumns.join("\0")]);

  const translitOut = useMemo(
    () => transliterateLettersOnly(input, layout, direction),
    [input, layout, direction],
  );

  const srtOut = useMemo(
    () =>
      assToSrt(input, {
        fields: assFields.length ? assFields : defaultSelectedFields(formatColumns),
        separator: assSeparator,
        keepEmpty: assKeepEmpty,
      }),
    [input, assFields, assSeparator, assKeepEmpty, formatColumns],
  );

  const output = mode === "ass-srt" ? srtOut : translitOut;

  const applyLoaded = (name: string, text: string) => {
    setFileName(name);
    setInput(text);
    setError(null);
    if (/\.ass$/i.test(name) || /\.ssa$/i.test(name) || looksLikeAss(text)) {
      setMode("ass-srt");
      const parsed = parseAss(text);
      setAssFields(defaultSelectedFields(parsed.formatColumns));
    }
  };

  const loadFile = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await window.transcribator.openDocument();
      if (!result.ok) {
        if (!result.canceled) setError(result.error);
        return;
      }
      applyLoaded(result.name, result.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadDroppedFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const file = list[0];
    setError(null);
    setBusy(true);
    try {
      void isSupportedDocument(file.name);
      const bytes = await file.arrayBuffer();
      const result = await window.transcribator.extractDocument(file.name, bytes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyLoaded(file.name, result.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveResult = async () => {
    const base = fileName ? fileName.replace(/\.[^.]+$/, "") : "converted";
    const ext = mode === "ass-srt" ? "srt" : "txt";
    const result = await window.transcribator.saveText(`${base}-out.${ext}`, output);
    if (!result.ok && !result.canceled && "error" in result) {
      setError(result.error);
    }
  };

  const copyOut = async () => {
    await navigator.clipboard.writeText(output);
  };

  const toggleField = (field: string) => {
    setAssFields((prev) => {
      if (prev.some((f) => f.toLowerCase() === field.toLowerCase())) {
        const next = prev.filter((f) => f.toLowerCase() !== field.toLowerCase());
        return next.length ? next : defaultSelectedFields(formatColumns);
      }
      return [...prev, field];
    });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setAssFields((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  return (
    <div className="page">
      <div className="main-header">
        <div>
          <h2>{t("convert.title")}</h2>
          <p>
            {mode === "ass-srt"
              ? t("convert.assLead")
              : t("convert.lead", { formats: formatSupportHint(), layout: layout.name })}
          </p>
        </div>
      </div>

      <div className="tool-toolbar">
        <div className="row-actions">
          <button
            type="button"
            className={`btn ${mode === "translit" ? "active-forward" : ""}`}
            onClick={() => setMode("translit")}
          >
            {t("convert.modeTranslit")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "ass-srt" ? "active-reverse" : ""}`}
            onClick={() => setMode("ass-srt")}
          >
            {t("convert.modeAssSrt")}
          </button>
        </div>
        {mode === "translit" && (
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${direction === "forward" ? "active-forward" : ""}`}
              onClick={() => setDirection("forward")}
            >
              {t("convert.forward")}
            </button>
            <button
              type="button"
              className={`btn ${direction === "reverse" ? "active-reverse" : ""}`}
              onClick={() => setDirection("reverse")}
            >
              {t("convert.reverse")}
            </button>
          </div>
        )}
        <div className="row-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void loadFile()}>
            {busy ? t("convert.loading") : t("convert.file")}
          </button>
          <button type="button" className="btn" onClick={() => setInput("")}>
            {t("convert.clear")}
          </button>
          <button type="button" className="btn" onClick={() => void copyOut()} disabled={!output}>
            {t("convert.copy")}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void saveResult()}
            disabled={!output}
          >
            {mode === "ass-srt" ? t("convert.assSave") : t("convert.save")}
          </button>
        </div>
      </div>

      {mode === "ass-srt" && (
        <div className="tool-block ass-options">
          <h3>{t("convert.assFields")}</h3>
          {formatColumns.length === 0 ? (
            <p className="hint">{t("convert.assNoDialogues")}</p>
          ) : (
            <div className="ass-field-list">
              {formatColumns.map((field) => {
                const checked = assFields.some((f) => f.toLowerCase() === field.toLowerCase());
                const orderIdx = assFields.findIndex(
                  (f) => f.toLowerCase() === field.toLowerCase(),
                );
                return (
                  <div className="ass-field-row" key={field}>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleField(field)}
                      />
                      <span>
                        {orderIdx >= 0 ? `${orderIdx + 1}. ` : ""}
                        {field}
                      </span>
                    </label>
                    {checked && (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={orderIdx <= 0}
                          onClick={() => moveField(orderIdx, -1)}
                        >
                          {t("convert.assMoveUp")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={orderIdx < 0 || orderIdx >= assFields.length - 1}
                          onClick={() => moveField(orderIdx, 1)}
                        >
                          {t("convert.assMoveDown")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <label className="ass-sep-row">
            <span className="pane-title">{t("convert.assSeparator")}</span>
            <input
              value={assSeparator}
              onChange={(e) => setAssSeparator(e.target.value)}
              placeholder=". "
              spellCheck={false}
            />
            <span className="hint">{t("convert.assSeparatorHint")}</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={assKeepEmpty}
              onChange={(e) => setAssKeepEmpty(e.target.checked)}
            />
            {t("convert.assKeepEmpty")}
          </label>
          {formatColumns.length > 0 && !srtOut && input.trim() && (
            <p className="hint">{t("convert.assNoDialogues")}</p>
          )}
        </div>
      )}

      {fileName && <p className="hint">{t("convert.fileLabel", { name: fileName })}</p>}
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
          void loadDroppedFiles(e.dataTransfer.files);
        }}
      >
        <p className="hint convert-drop-hint">
          {busy ? t("convert.dropBusy") : t("convert.dropIdle")}
        </p>

        <div className="dual-panes">
          <label className="pane">
            <span className="pane-title">{t("convert.source")}</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("convert.placeholder")}
              spellCheck={false}
            />
          </label>
          <label className="pane">
            <span className="pane-title">
              {mode === "ass-srt" ? t("convert.assPreview") : t("convert.result")}
            </span>
            <textarea value={output} readOnly spellCheck={false} />
          </label>
        </div>
      </div>
    </div>
  );
}
