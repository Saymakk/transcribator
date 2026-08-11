import { useEffect, useMemo, useState } from "react";
import type { AppState, HotkeysConfig, Layout } from "./shared/types";
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
        setState(next);
        setDraft((prev) => {
          if (dirty && prev) return prev;
          const layout =
            next.layouts.find((l) => l.id === next.activeLayoutId) ?? next.layouts[0];
          return structuredClone(layout);
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
    const next = rules.map((r, idx) =>
      idx === i ? { ...r, to: r.to + symbol } : r,
    );
    updateDraft({ ...draft, rules: next });
    setSelectedRuleId(next[i].id!);
  };

  const applyAlphabetLayout = (groupId: string, groupLabel: string, symbols: string[]) => {
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
    const next = withRuleIds(rules);
    updateDraft({ ...draft, rules: next });
    const firstEmpty = next.find((r) => !r.to || !r.from) ?? next[0];
    if (firstEmpty?.id) {
      setSelectedRuleId(firstEmpty.id);
      setFocusRequest({
        ruleId: firstEmpty.id,
        field: !firstEmpty.from ? "from" : "to",
        token: Date.now(),
      });
    }
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
            <h1>Transcribator</h1>
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
            onToggleMode={(target) =>
              void window.transcribator.toggleMode(target).then(applyState)
            }
            onSetMode={(mode) => void window.transcribator.setMode(mode).then(applyState)}
            onSetModeOff={() => void window.transcribator.setMode("off").then(applyState)}
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

          {section === "convert" && <ConvertPage layout={draft} />}
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
              onOpenAccessibility={() => void window.transcribator.openAccessibilitySettings()}
            />
          )}
        </main>
      </div>
    </LocaleProvider>
  );
}
