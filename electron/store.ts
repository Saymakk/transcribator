import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { v4 as uuidv4 } from "uuid";
import type {
  AppState,
  CustomPalette,
  Layout,
  LocaleId,
  PuntoDictEntry,
  PuntoMode,
  PuntoPairId,
  TranslitMode,
} from "./shared/types";
import { createDefaultLayout } from "./translit/defaultLayout";
import {
  DEFAULT_PUNTO_PAIR,
  getPuntoPair,
  isPuntoPairId,
  migratePuntoMode,
} from "./dicts/pairs";
import { normalizeLocale } from "../src/shared/i18n";
import { DEFAULT_HOTKEYS, migrateHotkeys, type HotkeysConfig } from "../src/shared/hotkeys";
import { DEFAULT_ASS_SRT_PREFS } from "../src/shared/types";
import { migrateAssSrtPrefs } from "../src/shared/assSrtPrefs";
import { DEFAULT_UPDATE_PREFS, migrateUpdatePrefs, type UpdatePrefs } from "../src/shared/updateFeed";
import type { AssSrtPrefs } from "./shared/types";

type PersistedState = {
  layouts: Layout[];
  activeLayoutId: string;
  mode: TranslitMode;
  puntoMode: PuntoMode;
  puntoPairId: PuntoPairId;
  puntoDictionary: PuntoDictEntry[];
  customPalettes: CustomPalette[];
  launchAtLogin: boolean;
  locale: LocaleId;
  hotkeys: HotkeysConfig;
  assSrtPrefs: AssSrtPrefs;
  updatePrefs: UpdatePrefs;
};

const DEFAULT_MODE: TranslitMode = "off";

function defaultPersisted(): PersistedState {
  const layout = createDefaultLayout();
  return {
    layouts: [layout],
    activeLayoutId: layout.id,
    mode: DEFAULT_MODE,
    puntoMode: "off",
    puntoPairId: DEFAULT_PUNTO_PAIR,
    puntoDictionary: [],
    customPalettes: [],
    launchAtLogin: false,
    locale: normalizeLocale(typeof app !== "undefined" ? app.getLocale() : "en"),
    hotkeys: { ...DEFAULT_HOTKEYS },
    assSrtPrefs: { ...DEFAULT_ASS_SRT_PREFS, fields: [...DEFAULT_ASS_SRT_PREFS.fields] },
    updatePrefs: { ...DEFAULT_UPDATE_PREFS },
  };
}

export class AppStore {
  private filePath: string;
  private data: PersistedState;
  private hookActive = false;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "settings.json");
    this.data = this.load();
  }

  private load(): PersistedState {
    try {
      if (!fs.existsSync(this.filePath)) {
        const initial = defaultPersisted();
        this.write(initial);
        return initial;
      }
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<PersistedState>;
      const fallback = defaultPersisted();
      const layouts =
        Array.isArray(raw.layouts) && raw.layouts.length > 0 ? raw.layouts : fallback.layouts;
      const activeLayoutId =
        layouts.some((l) => l.id === raw.activeLayoutId) && raw.activeLayoutId
          ? raw.activeLayoutId
          : layouts[0].id;
      return {
        layouts,
        activeLayoutId,
        mode: raw.mode === "forward" || raw.mode === "reverse" || raw.mode === "off" ? raw.mode : "off",
        puntoMode: migratePuntoMode(
          (raw as { puntoMode?: unknown }).puntoMode,
        ),
        puntoPairId: isPuntoPairId((raw as { puntoPairId?: unknown }).puntoPairId)
          ? ((raw as { puntoPairId: PuntoPairId }).puntoPairId)
          : fallback.puntoPairId,
        puntoDictionary: Array.isArray(raw.puntoDictionary)
          ? raw.puntoDictionary
              .filter((e) => e && typeof e.from === "string" && typeof e.to === "string")
              .map((e) => ({ from: e.from, to: e.to }))
          : fallback.puntoDictionary,
        customPalettes: Array.isArray((raw as { customPalettes?: unknown }).customPalettes)
          ? ((raw as { customPalettes: CustomPalette[] }).customPalettes)
              .filter(
                (p) =>
                  p &&
                  typeof p.id === "string" &&
                  typeof p.name === "string" &&
                  Array.isArray(p.symbols),
              )
              .map((p) => ({
                id: p.id,
                name: p.name,
                symbols: p.symbols.filter((s) => typeof s === "string"),
              }))
          : [],
        launchAtLogin: Boolean(raw.launchAtLogin),
        locale: normalizeLocale(
          typeof (raw as { locale?: string }).locale === "string"
            ? (raw as { locale: string }).locale
            : app.getLocale(),
        ),
        hotkeys: migrateHotkeys((raw as { hotkeys?: unknown }).hotkeys),
        assSrtPrefs: migrateAssSrtPrefs((raw as { assSrtPrefs?: unknown }).assSrtPrefs),
        updatePrefs: migrateUpdatePrefs((raw as { updatePrefs?: unknown }).updatePrefs),
      };
    } catch {
      const initial = defaultPersisted();
      this.write(initial);
      return initial;
    }
  }

  private write(data: PersistedState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  private persist(): void {
    this.write(this.data);
  }

  getState(): AppState {
    return {
      ...this.data,
      hookActive: this.hookActive,
    };
  }

  setHookActive(active: boolean): AppState {
    this.hookActive = active;
    return this.getState();
  }

  setMode(mode: TranslitMode): AppState {
    this.data.mode = mode;
    this.persist();
    return this.getState();
  }

  /** Клик по кнопке режима: повтор — выкл. */
  toggleMode(target: "forward" | "reverse"): AppState {
    if (this.data.mode === target) {
      this.data.mode = "off";
    } else {
      this.data.mode = target;
    }
    this.persist();
    return this.getState();
  }

  toggleChord(target: "forward" | "reverse"): AppState {
    return this.toggleMode(target);
  }

  setPuntoMode(mode: PuntoMode): AppState {
    this.data.puntoMode = mode;
    this.persist();
    return this.getState();
  }

  togglePuntoMode(target: "a2b" | "b2a" | "auto"): AppState {
    if (this.data.puntoMode === target) {
      this.data.puntoMode = "off";
    } else {
      this.data.puntoMode = target;
    }
    this.persist();
    return this.getState();
  }

  setPuntoPairId(id: PuntoPairId): AppState {
    if (!isPuntoPairId(id)) return this.getState();
    this.data.puntoPairId = id;
    // Выбор пары включает двусторонний авто-режим
    this.data.puntoMode = "auto";
    this.persist();
    return this.getState();
  }

  setPuntoDictionary(entries: PuntoDictEntry[]): AppState {
    this.data.puntoDictionary = entries
      .map((e) => ({ from: e.from.trim(), to: e.to }))
      .filter((e) => e.from.length > 0);
    this.persist();
    return this.getState();
  }

  setCustomPalettes(palettes: CustomPalette[]): AppState {
    this.data.customPalettes = palettes
      .map((p) => ({
        id: String(p.id || uuidv4()),
        name: String(p.name || "").trim() || "Palette",
        symbols: Array.isArray(p.symbols)
          ? [...new Set(p.symbols.map(String).filter((s) => s.length > 0))]
          : [],
      }))
      .filter((p) => p.name.length > 0);
    this.persist();
    return this.getState();
  }

  upsertCustomPalette(palette: CustomPalette): AppState {
    const next = [...this.data.customPalettes];
    const idx = next.findIndex((p) => p.id === palette.id);
    const cleaned: CustomPalette = {
      id: palette.id || uuidv4(),
      name: palette.name.trim() || "Palette",
      symbols: [...new Set(palette.symbols.map(String).filter(Boolean))],
    };
    if (idx === -1) next.push(cleaned);
    else next[idx] = cleaned;
    return this.setCustomPalettes(next);
  }

  deleteCustomPalette(id: string): AppState {
    return this.setCustomPalettes(this.data.customPalettes.filter((p) => p.id !== id));
  }

  getPuntoPackIds(): string[] {
    return getPuntoPair(this.data.puntoPairId).packIds;
  }

  setActiveLayout(id: string): AppState {
    if (!this.data.layouts.some((l) => l.id === id)) {
      return this.getState();
    }
    this.data.activeLayoutId = id;
    this.persist();
    return this.getState();
  }

  setLaunchAtLogin(enabled: boolean): AppState {
    this.data.launchAtLogin = enabled;
    this.persist();
    return this.getState();
  }

  setHotkeys(hotkeys: HotkeysConfig): AppState {
    this.data.hotkeys = migrateHotkeys(hotkeys);
    this.persist();
    return this.getState();
  }

  getHotkeys(): HotkeysConfig {
    return this.data.hotkeys;
  }

  setAssSrtPrefs(prefs: AssSrtPrefs): AppState {
    this.data.assSrtPrefs = migrateAssSrtPrefs(prefs);
    this.persist();
    return this.getState();
  }

  setUpdatePrefs(prefs: UpdatePrefs): AppState {
    this.data.updatePrefs = migrateUpdatePrefs(prefs);
    this.persist();
    return this.getState();
  }

  setLocale(locale: LocaleId): AppState {
    this.data.locale = normalizeLocale(locale);
    this.persist();
    return this.getState();
  }

  getActiveLayout(): Layout {
    return (
      this.data.layouts.find((l) => l.id === this.data.activeLayoutId) ?? this.data.layouts[0]
    );
  }

  saveLayout(layout: Layout): AppState {
    const idx = this.data.layouts.findIndex((l) => l.id === layout.id);
    if (idx === -1) {
      this.data.layouts.push(layout);
    } else {
      this.data.layouts[idx] = layout;
    }
    this.persist();
    return this.getState();
  }

  createLayout(name: string): AppState {
    const layout: Layout = {
      id: uuidv4(),
      name: name.trim() || "New layout",
      rules: [],
    };
    this.data.layouts.push(layout);
    this.data.activeLayoutId = layout.id;
    this.persist();
    return this.getState();
  }

  cloneLayout(id: string, copySuffix = "(copy)"): AppState {
    const source = this.data.layouts.find((l) => l.id === id);
    if (!source) return this.getState();
    const clone: Layout = {
      id: uuidv4(),
      name: `${source.name} ${copySuffix}`,
      rules: source.rules.map((r) => ({ ...r })),
    };
    this.data.layouts.push(clone);
    this.data.activeLayoutId = clone.id;
    this.persist();
    return this.getState();
  }

  deleteLayout(id: string): AppState {
    if (this.data.layouts.length <= 1) return this.getState();
    this.data.layouts = this.data.layouts.filter((l) => l.id !== id);
    if (this.data.activeLayoutId === id) {
      this.data.activeLayoutId = this.data.layouts[0].id;
    }
    this.persist();
    return this.getState();
  }

  renameLayout(id: string, name: string): AppState {
    const layout = this.data.layouts.find((l) => l.id === id);
    if (!layout) return this.getState();
    layout.name = name.trim() || layout.name;
    this.persist();
    return this.getState();
  }
}
