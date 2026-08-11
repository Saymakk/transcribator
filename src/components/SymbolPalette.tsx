import { useEffect, useMemo, useState } from "react";
import type { CustomPalette } from "../shared/types";
import type { SymbolGroup } from "../shared/palette";
import {
  mergePaletteGroups,
  rulesForPaletteApply,
  SYMBOL_PALETTE,
} from "../shared/palette";
import { useLocale } from "../i18n/LocaleContext";

type Props = {
  customPalettes: CustomPalette[];
  onPick: (symbol: string, groupId: string, symbols: string[]) => void;
  onApplyLayout: (groupId: string, groupLabel: string, symbols: string[]) => void;
  onUpsertCustom: (palette: CustomPalette) => void;
  onDeleteCustom: (id: string) => void;
};

function splitSymbols(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/u).map((s) => s.trim()).filter(Boolean))];
}

export function SymbolPalette({
  customPalettes,
  onPick,
  onApplyLayout,
  onUpsertCustom,
  onDeleteCustom,
}: Props) {
  const { t } = useLocale();
  const groups = useMemo(
    () => mergePaletteGroups(SYMBOL_PALETTE, customPalettes),
    [customPalettes],
  );

  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.defaultOpen ?? false])),
  );

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.id] === undefined) next[g.id] = g.defaultOpen ?? false;
      }
      return next;
    });
  }, [groups]);

  const [editId, setEditId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftSymbols, setDraftSymbols] = useState("");

  const toggle = (id: string) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    setOpen(Object.fromEntries(groups.map((g) => [g.id, true])));
  };

  const collapseAll = () => {
    setOpen(Object.fromEntries(groups.map((g) => [g.id, false])));
  };

  const groupTitle = (g: SymbolGroup) => {
    if (g.custom && g.name) return g.name;
    const key = `palette.${g.id}`;
    const translated = t(key);
    return translated === key ? g.id : translated;
  };

  const startCreate = () => {
    setEditId("new");
    setDraftName("");
    setDraftSymbols("");
  };

  const startEdit = (p: CustomPalette) => {
    setEditId(p.id);
    setDraftName(p.name);
    setDraftSymbols(p.symbols.join(" "));
  };

  const saveCustom = () => {
    const symbols = splitSymbols(draftSymbols);
    if (!draftName.trim()) return;
    onUpsertCustom({
      id: editId && editId !== "new" ? editId : crypto.randomUUID(),
      name: draftName.trim(),
      symbols,
    });
    setEditId(null);
    setDraftName("");
    setDraftSymbols("");
  };

  return (
    <div className="editor-card editor-card--palette">
      <div className="palette-header">
        <h3>{t("palette.title")}</h3>
        <div className="row-actions">
          <button type="button" className="btn btn-sm" onClick={expandAll}>
            {t("palette.expand")}
          </button>
          <button type="button" className="btn btn-sm" onClick={collapseAll}>
            {t("palette.collapse")}
          </button>
        </div>
      </div>
      <p className="hint palette-hint">{t("palette.hint")}</p>

      <div className="palette-custom-block">
        <div className="palette-header">
          <h4 className="palette-custom-title">{t("palette.customTitle")}</h4>
          <button type="button" className="btn btn-sm" onClick={startCreate}>
            {t("palette.customAdd")}
          </button>
        </div>
        {customPalettes.length === 0 && !editId && (
          <p className="hint">{t("palette.customEmpty")}</p>
        )}
        {customPalettes.map((p) => (
          <div className="palette-custom-row" key={p.id}>
            <span className="palette-custom-name">
              {p.name} <span className="hint">({p.symbols.length})</span>
            </span>
            <div className="row-actions">
              <button type="button" className="btn btn-sm" onClick={() => startEdit(p)}>
                {t("palette.customEdit")}
              </button>
              <button
                type="button"
                className="btn btn-sm danger"
                onClick={() => onDeleteCustom(p.id)}
              >
                {t("palette.customDelete")}
              </button>
            </div>
          </div>
        ))}
        {editId && (
          <div className="palette-custom-form">
            <label>
              <span className="pane-title">{t("palette.customName")}</span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label>
              <span className="pane-title">{t("palette.customSymbols")}</span>
              <textarea
                value={draftSymbols}
                onChange={(e) => setDraftSymbols(e.target.value)}
                rows={3}
                spellCheck={false}
              />
            </label>
            <div className="row-actions">
              <button type="button" className="btn primary btn-sm" onClick={saveCustom}>
                {t("palette.customSave")}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEditId(null)}>
                {t("convert.clear")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="palette">
        {groups.map((g) => {
          const isOpen = open[g.id] ?? false;
          const canApply = Boolean(rulesForPaletteApply(g.id, g.symbols)?.length);
          return (
            <div className={`palette-group ${isOpen ? "open" : "closed"}`} key={g.id}>
              <div className="palette-group-bar">
                <button
                  type="button"
                  className="palette-group-toggle"
                  onClick={() => toggle(g.id)}
                  aria-expanded={isOpen}
                >
                  <span className="palette-chevron" aria-hidden>
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="palette-group-title">{groupTitle(g)}</span>
                  <span className="palette-group-count">{g.symbols.length}</span>
                </button>
                {canApply && (
                  <button
                    type="button"
                    className="btn btn-sm palette-apply-btn"
                    title={t("palette.useAsLayout")}
                    onClick={() => onApplyLayout(g.id, groupTitle(g), g.symbols)}
                  >
                    {t("palette.useAsLayout")}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="symbol-grid">
                  {g.symbols.map((symbol, i) => {
                    const wide = [...symbol].length > 1;
                    return (
                      <button
                        key={`${g.id}-${symbol}-${i}`}
                        type="button"
                        className={`symbol-btn${wide ? " symbol-btn--wide" : ""}`}
                        title={symbol}
                        onClick={() => onPick(symbol, g.id, g.symbols)}
                      >
                        <span className="symbol-btn-label">{symbol}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
