import { useMemo, useState } from "react";
import type { Layout, RuleConflict } from "../shared/types";
import { makeRule, withRuleIds } from "../shared/ruleIds";
import { useLocale } from "../i18n/LocaleContext";
import { EditorTextField } from "./EditorTextField";

export type RuleFocusRequest = {
  ruleId: string;
  field: "from" | "to";
  token: number;
};

type Props = {
  layout: Layout;
  preview: string;
  previewOut: string;
  conflicts: RuleConflict[];
  selectedRuleId: string | null;
  /** External focus request (e.g. after applying palette). */
  focusRequest?: RuleFocusRequest | null;
  swapDisplay: boolean;
  onSwapDisplayChange: (value: boolean) => void;
  onPreviewChange: (value: string) => void;
  onSelectRule: (ruleId: string) => void;
  onChange: (layout: Layout) => void;
};

export function LayoutEditor({
  layout,
  preview,
  previewOut,
  conflicts,
  selectedRuleId,
  focusRequest = null,
  swapDisplay,
  onSwapDisplayChange,
  onPreviewChange,
  onSelectRule,
  onChange,
}: Props) {
  const { t } = useLocale();
  const [localFocus, setLocalFocus] = useState<RuleFocusRequest | null>(null);

  const rules = useMemo(() => withRuleIds(layout.rules), [layout.rules]);
  const activeFocus = useMemo(() => {
    if (focusRequest && localFocus) {
      return focusRequest.token >= localFocus.token ? focusRequest : localFocus;
    }
    return focusRequest ?? localFocus;
  }, [focusRequest, localFocus]);

  const commit = (nextRules: ReturnType<typeof withRuleIds>) => {
    onChange({ ...layout, rules: nextRules });
  };

  const updateRule = (ruleId: string, field: "from" | "to", value: string) => {
    commit(rules.map((r) => (r.id === ruleId ? { ...r, [field]: value } : r)));
  };

  const addRule = () => {
    const rule = makeRule("", "");
    commit([...rules, rule]);
    onSelectRule(rule.id!);
    setLocalFocus({ ruleId: rule.id!, field: "to", token: Date.now() });
  };

  const removeRule = (ruleId: string) => {
    commit(rules.filter((r) => r.id !== ruleId));
  };

  const swapAllValues = () => {
    if (rules.length === 0) return;
    commit(rules.map((r) => ({ ...r, from: r.to, to: r.from })));
  };

  const leftField: "from" | "to" = swapDisplay ? "to" : "from";
  const rightField: "from" | "to" = swapDisplay ? "from" : "to";
  const leftLabel = swapDisplay ? t("layouts.symbol") : t("layouts.from");
  const rightLabel = swapDisplay ? t("layouts.from") : t("layouts.symbol");
  const arrow = swapDisplay ? "←" : "→";

  return (
    <div className="editor-card editor-card--rules">
      <div className="rules-toolbar">
        <h3>{t("layouts.rules")}</h3>
        <span className="rules-count">{rules.length}</span>
        <button
          type="button"
          className="btn btn-sm primary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addRule}
        >
          {t("layouts.addRule")}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${swapDisplay ? "active-reverse" : ""}`}
          onClick={() => onSwapDisplayChange(!swapDisplay)}
          title={t("layouts.swapDisplayHint")}
        >
          {t("layouts.swapDisplay")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={swapAllValues}
          disabled={rules.length === 0}
          title={t("layouts.swapValuesHint")}
        >
          {t("layouts.swapValues")}
        </button>
      </div>

      <div className="rules-table-wrap">
        {rules.length > 0 && (
          <div className="rules-head" aria-hidden>
            <span>{leftLabel}</span>
            <span className="arrow">{arrow}</span>
            <span>{rightLabel}</span>
            <span />
          </div>
        )}
        <div className="rules">
          {rules.length === 0 && (
            <p className="rules-empty">{t("layouts.emptyRules")}</p>
          )}
          {rules.map((rule, rowIndex) => {
            const ruleId = rule.id!;
            const focusField =
              activeFocus?.ruleId === ruleId ? activeFocus.field : null;
            const focusToken =
              activeFocus?.ruleId === ruleId ? activeFocus.token : null;
            return (
              <div className="rule-row" key={ruleId}>
                <EditorTextField
                  key={`${ruleId}-${leftField}`}
                  className={`rule-input rule-input-${leftField} ${
                    leftField === "to" && selectedRuleId === ruleId ? "selected" : ""
                  }`}
                  value={rule[leftField]}
                  placeholder={
                    leftField === "from"
                      ? t("layouts.placeholderFrom")
                      : t("layouts.placeholderTo")
                  }
                  onChange={(value) => updateRule(ruleId, leftField, value)}
                  onFocus={() => onSelectRule(ruleId)}
                  aria-label={
                    leftField === "from"
                      ? t("layouts.ruleFromAria", { n: rowIndex + 1 })
                      : t("layouts.ruleToAria", { n: rowIndex + 1 })
                  }
                  syncWhileFocused={leftField === "to"}
                  focusToken={focusField === leftField ? focusToken : null}
                />
                <span className="arrow">{arrow}</span>
                <EditorTextField
                  key={`${ruleId}-${rightField}`}
                  className={`rule-input rule-input-${rightField} ${
                    rightField === "to" && selectedRuleId === ruleId ? "selected" : ""
                  }`}
                  value={rule[rightField]}
                  placeholder={
                    rightField === "from"
                      ? t("layouts.placeholderFrom")
                      : t("layouts.placeholderTo")
                  }
                  onChange={(value) => updateRule(ruleId, rightField, value)}
                  onFocus={() => onSelectRule(ruleId)}
                  aria-label={
                    rightField === "from"
                      ? t("layouts.ruleFromAria", { n: rowIndex + 1 })
                      : t("layouts.ruleToAria", { n: rowIndex + 1 })
                  }
                  syncWhileFocused={rightField === "to"}
                  focusToken={focusField === rightField ? focusToken : null}
                />
                <button
                  type="button"
                  className="btn-icon danger"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => removeRule(ruleId)}
                  title={t("layouts.deleteRule")}
                  aria-label={t("layouts.deleteRuleAria")}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="preview-inline">
        <label htmlFor="preview-input" className="preview-inline-label">
          {t("layouts.preview")}
        </label>
        <input
          id="preview-input"
          className="preview-inline-input"
          value={preview}
          onChange={(e) => onPreviewChange(e.target.value)}
        />
        <span className="preview-inline-arrow">→</span>
        <output className="preview-inline-result" htmlFor="preview-input">
          {previewOut || "—"}
        </output>
      </div>

      {conflicts.length > 0 && (
        <details className="conflicts conflicts--compact">
          <summary>{t("layouts.conflicts", { n: conflicts.length })}</summary>
          <ul>
            {conflicts.map((c) => (
              <li key={c.symbol}>
                «{c.symbol}» ← {c.fromOptions.join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
