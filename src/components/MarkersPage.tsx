import { useMemo, useState } from "react";
import {
  CUE_MARKUP_PRESETS,
  cueMarkupPresetById,
  detectDominantCueMarkup,
  hasStructuredParts,
  type CueMarkupPresetId,
  type CueParts,
} from "../shared/cueMarkup";
import {
  createEmptyEntry,
  emptyMarkersDocument,
  isValidMarkerTime,
  looksLikeMarkers,
  parseMarkers,
  reformatEntry,
  serializeMarkers,
  withParts,
  type MarkerEntry,
  type MarkerKind,
  type MarkersDocument,
} from "../shared/markers";
import { useLocale } from "../i18n/LocaleContext";

type ColId = "kind" | "start" | "end" | "actor" | "role" | "body" | "actions";

const DEFAULT_COLS: ColId[] = ["kind", "start", "end", "actor", "role", "body", "actions"];

function electronPath(file: File): string | null {
  const p = (file as File & { path?: string }).path;
  return typeof p === "string" && p.length > 0 ? p : null;
}

function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

export function MarkersPage() {
  const { t } = useLocale();
  const [doc, setDoc] = useState<MarkersDocument>(() => emptyMarkersDocument());
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState("");
  const [markupId, setMarkupId] = useState<CueMarkupPresetId>("actorRoleDot");
  const [cols, setCols] = useState<ColId[]>(DEFAULT_COLS);
  const [dragCol, setDragCol] = useState<ColId | null>(null);
  const [dropCol, setDropCol] = useState<ColId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const markup = useMemo(() => cueMarkupPresetById(markupId), [markupId]);
  const serialized = useMemo(() => serializeMarkers(doc), [doc]);

  const structuredCount = useMemo(
    () => doc.entries.filter((e) => hasStructuredParts(e.parts)).length,
    [doc.entries],
  );

  const invalidTimes = useMemo(() => {
    const bad = new Set<string>();
    for (const e of doc.entries) {
      if (!isValidMarkerTime(e.start) || !isValidMarkerTime(e.end)) bad.add(e.id);
    }
    return bad;
  }, [doc.entries]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return doc.entries;
    return doc.entries.filter(
      (e) =>
        e.text.toLowerCase().includes(q) ||
        e.parts.actor.toLowerCase().includes(q) ||
        e.parts.role.toLowerCase().includes(q) ||
        e.parts.body.toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        e.start.includes(q) ||
        e.end.includes(q),
    );
  }, [doc.entries, filter]);

  const colLabel = (id: ColId): string => {
    switch (id) {
      case "kind":
        return t("markers.colKind");
      case "start":
        return t("markers.colStart");
      case "end":
        return t("markers.colEnd");
      case "actor":
        return t("markers.colActor");
      case "role":
        return t("markers.colRole");
      case "body":
        return t("markers.colBody");
      case "actions":
        return t("markers.colActions");
    }
  };

  const reorderCol = (fromId: ColId, toId: ColId) => {
    if (fromId === toId) return;
    setCols((prev) => {
      const next = [...prev];
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const loadText = (name: string, text: string, pathValue: string | null) => {
    if (!looksLikeMarkers(text) && text.trim()) {
      setError(t("markers.notMarkers"));
      return;
    }
    const parsed = parseMarkers(text);
    const detected = detectDominantCueMarkup(parsed.entries.map((e) => e.text));
    const preset = cueMarkupPresetById(detected);
    setMarkupId(detected);
    setDoc({
      ...parsed,
      invalidLines: [],
      entries: parsed.entries.map((e) =>
        hasStructuredParts(e.parts) ? reformatEntry(e, preset) : e,
      ),
    });
    setFileName(name);
    setFilePath(pathValue);
    setDirty(false);
    setSelectedId(null);
    setError(
      parsed.invalidLines.length
        ? t("markers.invalidLines", { n: String(parsed.invalidLines.length) })
        : null,
    );
    setStatus(
      pathValue
        ? t("markers.loadedPath", { name, path: pathValue })
        : t("markers.loadedName", { name }),
    );
  };

  const openFile = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await window.transcribator.openMarkers();
      if (!res.ok) {
        if (!res.canceled) setError(res.error);
        return;
      }
      loadText(res.name, res.text, res.path);
    } finally {
      setBusy(false);
    }
  };

  const loadDropped = async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    const file = list[0];
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const pathValue = electronPath(file);
      const buf = await file.arrayBuffer();
      const extracted = await window.transcribator.extractDocument(file.name, buf);
      if (!extracted.ok) {
        setError(extracted.error);
        return;
      }
      loadText(file.name, extracted.text, pathValue);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const patchEntry = (id: string, patch: Partial<MarkerEntry>) => {
    setDoc((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
    setDirty(true);
    setStatus(null);
  };

  const patchParts = (id: string, patch: Partial<CueParts>) => {
    setDoc((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => {
        if (e.id !== id) return e;
        return withParts(e, { ...e.parts, ...patch }, markup);
      }),
    }));
    setDirty(true);
    setStatus(null);
  };

  const applyMarkupToEntry = (id: string, presetId: CueMarkupPresetId = markupId) => {
    const preset = cueMarkupPresetById(presetId);
    setMarkupId(presetId);
    setDoc((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => {
        if (e.id !== id) return e;
        if (!hasStructuredParts(e.parts)) return e;
        return reformatEntry(e, preset);
      }),
    }));
    setDirty(true);
    setStatus(t("markers.markupAppliedOne"));
  };

  const applyMarkupToAll = (presetId: CueMarkupPresetId) => {
    const preset = cueMarkupPresetById(presetId);
    setMarkupId(presetId);
    setDoc((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        hasStructuredParts(e.parts) ? reformatEntry(e, preset) : e,
      ),
    }));
    setDirty(true);
    setStatus(t("markers.markupAppliedAll", { sample: preset.sample }));
  };

  const addEntry = (kind: MarkerKind = "Marker") => {
    const entry = createEmptyEntry(kind);
    setDoc((prev) => ({
      ...prev,
      entries: [...prev.entries, entry],
    }));
    setSelectedId(entry.id);
    setDirty(true);
    setStatus(null);
  };

  const removeEntry = (id: string) => {
    setDoc((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
    setStatus(null);
  };

  const moveEntry = (id: string, dir: -1 | 1) => {
    setDoc((prev) => {
      const index = prev.entries.findIndex((e) => e.id === id);
      if (index < 0) return prev;
      const nextIndex = index + dir;
      if (nextIndex < 0 || nextIndex >= prev.entries.length) return prev;
      const entries = [...prev.entries];
      [entries[index], entries[nextIndex]] = [entries[nextIndex], entries[index]];
      return { ...prev, entries };
    });
    setDirty(true);
    setStatus(null);
  };

  const canSaveInPlace = Boolean(filePath) && invalidTimes.size === 0;

  const saveInPlace = async () => {
    if (!filePath) {
      setError(t("markers.noPath"));
      return;
    }
    if (invalidTimes.size > 0) {
      setError(t("markers.fixTimes"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await window.transcribator.writeText(filePath, serialized);
      if (!res.ok) {
        if (!res.canceled) setError(res.error);
        return;
      }
      setDirty(false);
      setStatus(t("markers.savedPath", { path: res.path }));
      setFilePath(res.path);
      setFileName(basename(res.path));
    } finally {
      setBusy(false);
    }
  };

  const saveAs = async () => {
    if (invalidTimes.size > 0) {
      setError(t("markers.fixTimes"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const suggested = fileName ?? "markers.xml";
      const res = await window.transcribator.savePlainText(suggested, serialized);
      if (!res.ok) {
        if (!res.canceled) setError(res.error);
        return;
      }
      setDirty(false);
      setFilePath(res.path);
      setFileName(basename(res.path));
      setStatus(t("markers.savedPath", { path: res.path }));
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    setDoc(emptyMarkersDocument());
    setFilePath(null);
    setFileName(null);
    setDirty(false);
    setError(null);
    setStatus(null);
    setSelectedId(null);
  };

  const renderCell = (col: ColId, entry: MarkerEntry) => {
    switch (col) {
      case "kind":
        return (
          <select
            value={entry.kind}
            onChange={(e) => patchEntry(entry.id, { kind: e.target.value as MarkerKind })}
            aria-label={t("markers.colKind")}
          >
            <option value="Marker">Marker</option>
            <option value="Region">Region</option>
          </select>
        );
      case "start":
        return (
          <input
            className="markers-time"
            value={entry.start}
            onChange={(e) => patchEntry(entry.id, { start: e.target.value })}
            spellCheck={false}
            aria-label={t("markers.colStart")}
          />
        );
      case "end":
        return (
          <input
            className="markers-time"
            value={entry.end}
            onChange={(e) => patchEntry(entry.id, { end: e.target.value })}
            spellCheck={false}
            aria-label={t("markers.colEnd")}
          />
        );
      case "actor":
        return (
          <input
            className="markers-text"
            value={entry.parts.actor}
            onChange={(e) => patchParts(entry.id, { actor: e.target.value })}
            spellCheck={false}
            aria-label={t("markers.colActor")}
            placeholder={t("markers.colActor")}
          />
        );
      case "role":
        return (
          <input
            className="markers-text"
            value={entry.parts.role}
            onChange={(e) => patchParts(entry.id, { role: e.target.value })}
            spellCheck={false}
            aria-label={t("markers.colRole")}
            placeholder={t("markers.colRole")}
          />
        );
      case "body":
        return (
          <input
            className="markers-text"
            value={
              hasStructuredParts(entry.parts) ? entry.parts.body : entry.parts.body || entry.text
            }
            onChange={(e) => {
              if (hasStructuredParts(entry.parts)) {
                patchParts(entry.id, { body: e.target.value });
              } else {
                patchParts(entry.id, { body: e.target.value, actor: "", role: "" });
              }
            }}
            spellCheck={false}
            aria-label={t("markers.colBody")}
          />
        );
      case "actions":
        return (
          <div className="markers-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => applyMarkupToEntry(entry.id)}
              title={t("markers.markupApplyOne")}
              disabled={!hasStructuredParts(entry.parts)}
            >
              ✎
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => moveEntry(entry.id, -1)}
              title={t("markers.moveUp")}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => moveEntry(entry.id, 1)}
              title={t("markers.moveDown")}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => removeEntry(entry.id)}
              title={t("markers.remove")}
            >
              ×
            </button>
          </div>
        );
    }
  };

  return (
    <div className="page">
      <div className="main-header">
        <div>
          <h2>{t("markers.title")}</h2>
          <p>{t("markers.lead")}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void openFile()}>
            {t("markers.open")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !canSaveInPlace || !dirty}
            onClick={() => void saveInPlace()}
            title={filePath ? t("markers.saveInPlaceHint") : t("markers.noPath")}
          >
            {t("markers.save")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || doc.entries.length === 0 || invalidTimes.size > 0}
            onClick={() => void saveAs()}
          >
            {t("markers.saveAs")}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={clearAll}>
            {t("markers.clear")}
          </button>
        </div>
      </div>

      <div
        className={`drop-zone${dragOver ? " is-over" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void loadDropped(e.dataTransfer.files);
        }}
      >
        {t("markers.dropHint")}
      </div>

      <div className="ass-presets-row markers-markup-row">
        <span className="pane-title">{t("markers.markupPresets")}</span>
        <div className="ass-wrap-presets">
          {CUE_MARKUP_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`btn btn-sm${markupId === preset.id ? " is-on" : ""}`}
              onClick={() => applyMarkupToAll(preset.id)}
              title={t("markers.markupApplyAll")}
            >
              {preset.sample}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!selectedId}
          onClick={() => selectedId && applyMarkupToEntry(selectedId)}
          title={t("markers.markupApplyOne")}
        >
          {t("markers.markupApplyOne")}
        </button>
        <span className="hint">
          {t("markers.structuredCount", { n: String(structuredCount) })}
        </span>
      </div>

      <p className="hint">{t("markers.colReorderHint")}</p>

      <div className="markers-toolbar">
        <input
          className="markers-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("markers.filter")}
          spellCheck={false}
        />
        <button type="button" className="btn btn-sm" onClick={() => addEntry("Marker")}>
          {t("markers.addMarker")}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => addEntry("Region")}>
          {t("markers.addRegion")}
        </button>
        <span className="hint">
          {t("markers.count", { n: String(doc.entries.length) })}
          {dirty ? ` · ${t("markers.dirty")}` : ""}
          {fileName ? ` · ${fileName}` : ""}
        </span>
      </div>

      {error && <p className="error-text">{error}</p>}
      {status && !error && <p className="hint">{status}</p>}
      {filePath && <p className="hint mono-path">{filePath}</p>}

      <div className="markers-table-wrap">
        {visible.length === 0 ? (
          <p className="hint">{t("markers.empty")}</p>
        ) : (
          <table className="markers-table">
            <thead>
              <tr>
                {cols.map((col) => (
                  <th
                    key={col}
                    draggable={col !== "actions"}
                    className={`markers-col-head${dragCol === col ? " is-dragging" : ""}${
                      dropCol === col ? " is-drop-target" : ""
                    }`}
                    onDragStart={(e) => {
                      if (col === "actions") {
                        e.preventDefault();
                        return;
                      }
                      setDragCol(col);
                      setDropCol(col);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", col);
                    }}
                    onDragOver={(e) => {
                      if (col === "actions") return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropCol !== col) setDropCol(col);
                    }}
                    onDragLeave={() => {
                      if (dropCol === col) setDropCol(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = (dragCol ?? e.dataTransfer.getData("text/plain")) as ColId;
                      if (from && col !== "actions") reorderCol(from, col);
                      setDragCol(null);
                      setDropCol(null);
                    }}
                    onDragEnd={() => {
                      setDragCol(null);
                      setDropCol(null);
                    }}
                    title={col === "actions" ? undefined : t("markers.colReorderHint")}
                  >
                    {col !== "actions" && <span className="ass-order-grip" aria-hidden>⠿</span>}{" "}
                    {colLabel(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const bad = invalidTimes.has(entry.id);
                return (
                  <tr
                    key={entry.id}
                    className={`${bad ? "is-invalid" : ""}${
                      selectedId === entry.id ? " is-selected" : ""
                    }`}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    {cols.map((col) => (
                      <td key={col} className={col === "actions" ? "markers-actions-cell" : undefined}>
                        {renderCell(col, entry)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <details className="markers-raw">
        <summary>{t("markers.rawPreview")}</summary>
        <pre>{serialized || t("markers.empty")}</pre>
      </details>
    </div>
  );
}
