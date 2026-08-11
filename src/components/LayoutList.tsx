import { useState } from "react";
import type { AppState } from "../shared/types";
import { useLocale } from "../i18n/LocaleContext";

type Props = {
  state: AppState;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClone: () => void;
  onDelete: () => void;
  onRename: () => void;
};

export function LayoutList({
  state,
  onSelect,
  onCreate,
  onClone,
  onDelete,
  onRename,
}: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState(true);

  return (
    <div className="panel">
      <button
        type="button"
        className="panel-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="palette-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <h2>{t("nav.layouts")}</h2>
        <span className="palette-group-count">{state.layouts.length}</span>
      </button>
      {open && (
        <div className="panel-body">
          <div className="layout-list">
            {state.layouts.map((layout) => (
              <button
                key={layout.id}
                type="button"
                className={`layout-item ${layout.id === state.activeLayoutId ? "active" : ""}`}
                onClick={() => onSelect(layout.id)}
              >
                <span>{layout.name}</span>
                <span className="hint">{layout.rules.length}</span>
              </button>
            ))}
          </div>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={onCreate}>
              {t("layouts.create")}
            </button>
            <button type="button" className="btn" onClick={onClone}>
              {t("layouts.clone")}
            </button>
            <button type="button" className="btn" onClick={onRename}>
              {t("layouts.rename")}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={onDelete}
              disabled={state.layouts.length <= 1}
            >
              {t("layouts.delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
