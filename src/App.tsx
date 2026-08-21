import { startTransition, useEffect, useMemo, useState } from "react";
import type { AppState, HotkeysConfig, Layout } from "./shared/types";
import { DEFAULT_ASS_SRT_PREFS } from "./shared/types";
import { findReverseConflicts, transliterateWord } from "./shared/engine";
import {
  correspondingFromForSymbol,
  rulesForPaletteApply,
} from "./shared/palette";
import { formatChordLabel, DEFAULT_HOTKEYS } from "./shared/hotkeys";
import { getMessages, normalizeLocale, t as translate, type LocaleId } from "./shared/i18n";
import type { CustomPalette } from "./shared/types";
import { LocaleProvider } from "./i18n/LocaleContext";
import { SideNav, type AppSection } from "./components/SideNav";
import { ModeStrip } from "./components/ModeStrip";
import { LayoutList } from "./components/LayoutList";
import { LayoutEditor, type RuleFocusRequest } from "./components/LayoutEditor";
import { SymbolPalette } from "./components/SymbolPalette";
import { ConvertPage } from "./components/ConvertPage";
import { PuntoPage } from "./components/PuntoPage";
import { TransformPage } from "./components/TransformPage";
import { SettingsPage } from "./components/SettingsPage";
import { DonateModal } from "./components/DonateModal";
import { makeRule, withRuleIds } from "./shared/ruleIds";

export default function App() {
  const [section, setSection] = useState<AppSection>("layouts");
  const [state, setState] = useState<AppState | null>(null);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [preview, setPreview] = useState("привет");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [swapDisplay, setSwapDisplay] = useState(false);
  const [focusRequest, setFocusRequest] = useState<RuleFocusRequest | null>(null);
  const [donateOpen, setDonateOpen] = useState(false);

  const bootLocale = useMemo<LocaleId>(() => normalizeLocale(navigator.language), []);
  const locale = state?.locale ?? bootLocale;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const t = useMemo(
    () => (path: string, vars?: Record<string, string | number>) =>
      translate(messages, path, vars),
    [messages],
  );

  const hotkeys = state?.hotkeys ?? DEFAULT_HOTKEYS;

  useEffect(() => {
    let unsub = () => {};
    let unsubNav = () => {};
    void (async () => {
      const initial = await window.transcribator.getState();
      setState(initial);
      const active =
        initial.layouts.find((l) => l.id === initial.activeLayoutId) ?? initial.layouts[0];
      setDraft(structuredClone(active));
      unsub = window.transcribator.onStateChanged((next) => {
        startTransition(() => {
          setState(next);
          setDraft((prev) => {
            if (dirty && prev) return prev;
            const layout =
              next.layouts.find((l) => l.id === next.activeLayoutId) ?? next.layouts[0];
            return structuredClone(layout);
          });
        });
      });
      unsubNav = window.transcribator.onNavigate((sec) => {
        if (
          sec === "layouts" ||
          sec === "convert" ||
          sec === "punto" ||
          sec === "transform" ||
          sec === "settings"
        ) {
          setSection(sec);
        }
      });
    })();
    return () => {
      unsub();
      unsubNav();
    };
  }, [dirty]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const conflicts = useMemo(() => (draft ? findReverseConflicts(draft.rules) : []), [draft]);

  const previewOut = useMemo(() => {
    if (!draft) return "";
    const direction = state?.mode === "reverse" ? "reverse" : "forward";
    return transliterateWord(preview, draft, direction);
  }, [draft, preview, state?.mode]);

  const applyState = (next: AppState) => {
    setState(next);
    if (!dirty) {
      const layout = next.layouts.find((l) => l.id === next.activeLayoutId) ?? next.layouts[0];
      setDraft(structuredClone(layout));
    }
  };

  const changeLocale = (next: LocaleId) => {
    void window.transcribator.setLocale(next).then(applyState);
  };

  if (!state || !draft) {
    return (
      <LocaleProvider locale={locale} onLocaleChange={changeLocale}>
        <div className="loading">{t("app.loading")}</div>
      </LocaleProvider>
    );
  }

  const selectLayout = async (id: string) => {
    if (dirty && draft) {
      const ok = confirm(t("app.saveConfirm"));
      if (ok) {
        await window.transcribator.saveLayout(draft);
        setDirty(false);
      } else {
        setDirty(false);
      }
    }
    const next = await window.transcribator.setActiveLayout(id);
    applyState(next);
    const layout = next.layouts.find((l) => l.id === id) ?? next.layouts[0];
    setDraft(structuredClone(layout));
    setDirty(false);
  };

  const updateDraft = (next: Layout) => {
    setDraft({ ...next, rules: withRuleIds(next.rules) });
    setDirty(true);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const next = await window.transcribator.saveLayout({
      ...draft,
      rules: withRuleIds(draft.rules),
    });
    setDirty(false);
    applyState(next);
    return next;
  };

  /** Перед включением транслита сохраняем черновик раскладки — хук читает только сохранённые правила. */
  const ensureLayoutSaved = async () => {
    if (dirty && draft) await saveDraft();
  };

  const setTranslitMode = async (mode: AppState["mode"]) => {
    await ensureLayoutSaved();
    const next = await window.transcribator.setMode(mode);
    applyState(next);
  };

  const toggleTranslitMode = async (target: "forward" | "reverse") => {
    await ensureLayoutSaved();
    const next = await window.transcribator.toggleMode(target);
    applyState(next);
  };

  const applyAlphabetLayout = async (groupId: string, groupLabel: string, symbols: string[]) => {
    if (!draft) return;
    const rules = rulesForPaletteApply(groupId, symbols);
    if (!rules || rules.length === 0) {
      alert(t("palette.noLayoutMap"));
      return;
    }
    if (draft.rules.length > 0) {
      const ok = confirm(t("palette.useAsLayoutConfirm", { name: groupLabel }));
      if (!ok) return;
    }
    const nextRules = withRuleIds(rules);
    const nextLayout = { ...draft, rules: nextRules };
    setDraft(nextLayout);
    const firstEmpty = nextRules.find((r) => !r.to || !r.from) ?? nextRules[0];
    if (firstEmpty?.id) {
      setSelectedRuleId(firstEmpty.id);
      setFocusRequest({
        ruleId: firstEmpty.id,
        field: !firstEmpty.from ? "from" : "to",
        token: Date.now(),
      });
    }
    const next = await window.transcribator.saveLayout(nextLayout);
    setDirty(false);
    applyState(next);
  };

  const insertSymbol = (symbol: string, groupId: string, symbols: string[]) => {
    if (!draft) return;
    const rules = withRuleIds(draft.rules);
    if (rules.length === 0) {
      const from = correspondingFromForSymbol(groupId, symbol, symbols) ?? "";
      const rule = makeRule(from, symbol);
      updateDraft({ ...draft, rules: [rule] });
      setSelectedRuleId(rule.id!);
      setFocusRequest({ ruleId: rule.id!, field: from ? "to" : "from", token: Date.now() });
      return;
    }
    const index = selectedRuleId
      ? rules.findIndex((r) => r.id === selectedRuleId)
      : 0;
    const i = index >= 0 ? index : 0;

    const active = document.activeElement;
    const activeIsTargetField =
      active instanceof HTMLInputElement && active.classList.contains("rule-input-to");
    if (activeIsTargetField) {
      const start = active.selectionStart ?? active.value.length;
      const end = active.selectionEnd ?? start;
      const current = rules[i].to;
      const nextTo = current.slice(0, start) + symbol + current.slice(end);
      const next = rules.map((r, idx) =>
        idx === i ? { ...r, to: nextTo } : r,
      );
      updateDraft({ ...draft, rules: next });
      setSelectedRuleId(next[i].id!);
      setFocusRequest({ ruleId: next[i].id!, field: "to", token: Date.now() });
      return;
    }

    const next = rules.map((r, idx) =>
      idx === i ? { ...r, to: r.to + symbol } : r,
    );
    updateDraft({ ...draft, rules: next });
    setSelectedRuleId(next[i].id!);
  };

  const upsertCustomPalette = (palette: CustomPalette) => {
    void window.transcribator.upsertCustomPalette(palette).then(applyState);
  };

  const deleteCustomPalette = (id: string) => {
    void window.transcribator.deleteCustomPalette(id).then(applyState);
  };

  const forwardTitle = formatChordLabel(hotkeys.chordFirst, hotkeys.chordSecond);
  const reverseTitle = formatChordLabel(hotkeys.chordSecond, hotkeys.chordFirst);

  return (
    <LocaleProvider locale={locale} onLocaleChange={changeLocale}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-title-row">
              <h1>Transcribator</h1>
              <button
                type="button"
                className="btn-support"
                onClick={() => setDonateOpen(true)}
                title={t("donate.support")}
              >
                <svg
                  className="btn-support-icon"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M12 21s-6.7-4.35-9.33-7.6C.8 10.9 1.1 7.4 3.4 5.6c2-1.55 4.7-1.15 6.2.7L12 8.7l2.4-2.4c1.5-1.85 4.2-2.25 6.2-.7 2.3 1.8 2.6 5.3.73 7.8C18.7 16.65 12 21 12 21z"
                  />
                </svg>
                {t("donate.support")}
              </button>
            </div>
            <p>{t("app.brandSubtitle")}</p>
          </div>

          <SideNav section={section} onChange={setSection} />

          <ModeStrip
            state={state}
            forwardTitle={forwardTitle}
            reverseTitle={reverseTitle}
            undoHint={
              hotkeys.undoEnabled
                ? t("mode.undoHintMs", { ms: hotkeys.undoDoubleCtrlMs })
                : t("mode.undoOff")
            }
            onToggleMode={(target) => void toggleTranslitMode(target)}
            onSetMode={(mode) => void setTranslitMode(mode)}
            onSetModeOff={() => void setTranslitMode("off")}
            onTogglePunto={(target) =>
              void window.transcribator.togglePuntoMode(target).then(applyState)
            }
            onSetPuntoOff={() => void window.transcribator.setPuntoMode("off").then(applyState)}
          />

          {section === "layouts" && (
            <LayoutList
              state={state}
              onSelect={(id) => void selectLayout(id)}
              onCreate={() =>
                void window.transcribator.createLayout(t("app.newLayout")).then((next) => {
                  setDirty(false);
                  applyState(next);
                  const layout =
                    next.layouts.find((l) => l.id === next.activeLayoutId) ?? next.layouts[0];
                  setDraft(structuredClone(layout));
                })
              }
              onClone={() =>
                void window.transcribator.cloneLayout(state.activeLayoutId).then((next) => {
                  setDirty(false);
                  applyState(next);
                  const layout =
                    next.layouts.find((l) => l.id === next.activeLayoutId) ?? next.layouts[0];
                  setDraft(structuredClone(layout));
                })
              }
              onDelete={() =>
                void window.transcribator.deleteLayout(state.activeLayoutId).then((next) => {
                  setDirty(false);
                  applyState(next);
                  const layout =
                    next.layouts.find((l) => l.id === next.activeLayoutId) ?? next.layouts[0];
                  setDraft(structuredClone(layout));
                })
              }
              onRename={async () => {
                const current =
                  state.layouts.find((l) => l.id === state.activeLayoutId)?.name ?? "";
                const name = prompt(t("app.renamePrompt"), current);
                if (!name) return;
                const next = await window.transcribator.renameLayout(
                  state.activeLayoutId,
                  name,
                );
                applyState(next);
                setDraft((d) => (d ? { ...d, name } : d));
              }}
            />
          )}
        </aside>

        <main className="main">
          {!state.hookActive && (
            <div className="warn-banner">
              <span>{t("app.hookWarn")}</span>
              <button
                type="button"
                className="btn"
                onClick={() => void window.transcribator.openAccessibilitySettings()}
              >
                {t("app.openSettings")}
              </button>
            </div>
          )}

          {section === "layouts" && (
            <>
              <div className="main-header">
                <div>
                  <h2>{draft.name}</h2>
                  <p>
                    {t("app.layoutHelp")}
                    {dirty ? t("app.dirtyHint") : ""}
                  </p>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn primary" onClick={() => void saveDraft()}>
                    {t("app.save")}
                  </button>
                </div>
              </div>

              <div className="editor">
                <LayoutEditor
                  layout={draft}
                  preview={preview}
                  previewOut={previewOut}
                  conflicts={conflicts}
                  selectedRuleId={selectedRuleId}
                  focusRequest={focusRequest}
                  swapDisplay={swapDisplay}
                  onSwapDisplayChange={setSwapDisplay}
                  onPreviewChange={setPreview}
                  onSelectRule={setSelectedRuleId}
                  onChange={updateDraft}
                />
                <SymbolPalette
                  customPalettes={state.customPalettes ?? []}
                  onPick={insertSymbol}
                  onApplyLayout={applyAlphabetLayout}
                  onUpsertCustom={upsertCustomPalette}
                  onDeleteCustom={deleteCustomPalette}
                />
              </div>
            </>
          )}

          {section === "convert" && (
            <ConvertPage
              layout={draft}
              assSrtPrefs={state.assSrtPrefs ?? DEFAULT_ASS_SRT_PREFS}
              onAssSrtPrefsChange={(prefs) =>
                void window.transcribator.setAssSrtPrefs(prefs).then(applyState)
              }
            />
          )}
          {section === "punto" && (
            <PuntoPage
              state={state}
              onTogglePunto={(target) =>
                void window.transcribator.togglePuntoMode(target).then(applyState)
              }
              onSetPuntoOff={() => void window.transcribator.setPuntoMode("off").then(applyState)}
              onSetPair={async (id) => {
                const next = await window.transcribator.setPuntoPairId(id);
                applyState(next);
              }}
              onSaveDictionary={async (entries) => {
                const next = await window.transcribator.setPuntoDictionary(entries);
                applyState(next);
              }}
            />
          )}
          {section === "transform" && <TransformPage />}
          {section === "settings" && (
            <SettingsPage
              state={state}
              onLocaleChange={changeLocale}
              onLaunchAtLogin={(enabled) =>
                void window.transcribator.setLaunchAtLogin(enabled).then(applyState)
              }
              onHotkeysChange={(hk: HotkeysConfig) =>
                void window.transcribator.setHotkeys(hk).then(applyState)
              }
              onUpdatePrefsChange={(prefs) =>
                void window.transcribator.setUpdatePrefs(prefs).then(applyState)
              }
              onOpenAccessibility={() => void window.transcribator.openAccessibilitySettings()}
            />
          )}
        </main>
        <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
      </div>
    </LocaleProvider>
  );
}
