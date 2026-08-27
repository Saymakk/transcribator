import { uIOhook, UiohookKeyboardEvent, UiohookKey } from "uiohook-napi";
import type { AppStore } from "../store";
import { transliterateWord } from "../translit/engine";
import { ChordDetector } from "./chords";
import { charFromKeycode } from "./keymaps";
import { replaceLastChars } from "./replace";

const WORD_BOUNDARIES = new Set([
  " ",
  "\n",
  "\t",
  ".",
  ",",
  "!",
  "?",
  ";",
  ":",
  "…",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "«",
  "»",
  '"',
  "'",
  "—",
  "–",
  "-",
  "/",
  "\\",
  "№",
  "%",
  "*",
  "+",
  "=",
  "_",
]);

type ModeChangeHandler = () => void;

type LastReplacement = {
  original: string;
  converted: string;
  boundary: string;
};

type Stroke = { keycode: number; shift: boolean };

export class KeyboardEngine {
  private store: AppStore;
  private chord = new ChordDetector();
  /** Буфер для транслита (символы в выбранной раскладке). */
  private wordBuffer = "";
  private strokes: Stroke[] = [];
  private pendingBoundary: string | null = null;
  private injecting = false;
  private started = false;
  private onModeChange: ModeChangeHandler | null = null;
  private lastReplacement: LastReplacement | null = null;
  private lastCtrlUpAt = 0;
  private ctrlTapDirty = false;
  private suppressForAppFocus = false;

  constructor(store: AppStore) {
    this.store = store;
    this.syncHotkeysFromStore();
    this.chord.onChord((kind) => {
      if (this.suppressForAppFocus) return;
      this.store.toggleChord(kind);
      this.clearBuffers();
      this.ctrlTapDirty = true;
      this.onModeChange?.();
    });
  }

  syncHotkeysFromStore(): void {
    const hk = this.store.getHotkeys();
    this.chord.setChordKeys(hk.chordFirst, hk.chordSecond);
  }

  setSuppressForAppFocus(suppress: boolean): void {
    this.suppressForAppFocus = suppress;
    if (suppress) {
      this.clearBuffers();
      this.chord.reset();
    }
  }

  setOnModeChange(handler: ModeChangeHandler): void {
    this.onModeChange = handler;
  }

  start(): boolean {
    if (this.started) return true;
    try {
      uIOhook.on("keydown", (e) => void this.onKeyDown(e));
      uIOhook.on("keyup", (e) => void this.onKeyUp(e));
      uIOhook.start();
      this.started = true;
      this.store.setHookActive(true);
      return true;
    } catch (error) {
      console.error("Failed to start keyboard hook", error);
      this.store.setHookActive(false);
      return false;
    }
  }

  stop(): void {
    if (!this.started) return;
    try {
      uIOhook.stop();
    } catch {
      // ignore
    }
    this.started = false;
    this.store.setHookActive(false);
  }

  private clearBuffers(): void {
    this.wordBuffer = "";
    this.strokes = [];
    this.pendingBoundary = null;
  }

  private liveActive(state: ReturnType<AppStore["getState"]>): boolean {
    return state.mode !== "off";
  }

  private isCtrlKey(keycode: number): boolean {
    return keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight;
  }

  private async onKeyUp(e: UiohookKeyboardEvent): Promise<void> {
    this.chord.handleKeyUp(e.keycode);

    if (this.suppressForAppFocus) {
      this.pendingBoundary = null;
      return;
    }

    if (this.isCtrlKey(e.keycode)) {
      await this.handleCtrlTap();
    }

    if (this.injecting || !this.pendingBoundary) return;

    const boundary = this.pendingBoundary;
    this.pendingBoundary = null;
    await this.flushWord(boundary);
  }

  private async handleCtrlTap(): Promise<void> {
    if (this.injecting) return;
    const hk = this.store.getHotkeys();
    if (!hk.undoEnabled) {
      this.lastCtrlUpAt = 0;
      this.ctrlTapDirty = false;
      return;
    }

    const now = Date.now();
    if (
      !this.ctrlTapDirty &&
      this.lastCtrlUpAt > 0 &&
      now - this.lastCtrlUpAt <= hk.undoDoubleCtrlMs
    ) {
      this.lastCtrlUpAt = 0;
      this.ctrlTapDirty = false;
      await this.undoLastReplacement();
      return;
    }

    this.lastCtrlUpAt = now;
    this.ctrlTapDirty = false;
  }

  private async undoLastReplacement(): Promise<void> {
    const last = this.lastReplacement;
    if (!last) return;

    this.lastReplacement = null;
    const deleteCount = [...last.converted].length + [...last.boundary].length;
    const restore = last.original + last.boundary;

    this.injecting = true;
    try {
      const result = await replaceLastChars(deleteCount, restore);
      if (!result.ok) {
        console.error("Undo failed:", result.error);
      }
    } finally {
      this.injecting = false;
    }
  }

  private async onKeyDown(e: UiohookKeyboardEvent): Promise<void> {
    if (this.injecting) return;

    if (this.suppressForAppFocus) {
      this.clearBuffers();
      return;
    }

    if (!this.isCtrlKey(e.keycode)) {
      if (this.lastCtrlUpAt > 0) {
        this.ctrlTapDirty = true;
      }
    }

    const chordHandled = this.chord.handleKeyDown(e.keycode);
    if (chordHandled || (this.chord.isCtrlDown() && this.chord.isChordKey(e.keycode))) {
      this.clearBuffers();
      if (!this.isCtrlKey(e.keycode)) {
        this.ctrlTapDirty = true;
      }
      return;
    }

    const state = this.store.getState();
    if (!this.liveActive(state)) {
      if (this.wordBuffer || this.strokes.length || this.pendingBoundary) {
        this.clearBuffers();
      }
      return;
    }

    if (e.metaKey || e.altKey || this.chord.isCtrlDown()) {
      return;
    }

    if (e.keycode === UiohookKey.Backspace) {
      this.wordBuffer = this.wordBuffer.slice(0, -1);
      this.strokes.pop();
      this.pendingBoundary = null;
      this.lastReplacement = null;
      return;
    }

    if (e.keycode === UiohookKey.Enter) {
      this.pendingBoundary = "\n";
      return;
    }
    if (e.keycode === UiohookKey.Space) {
      this.pendingBoundary = " ";
      return;
    }
    if (e.keycode === UiohookKey.Tab) {
      this.pendingBoundary = "\t";
      return;
    }

    const shift = Boolean(e.shiftKey);
    const asQwerty = charFromKeycode(e.keycode, shift, "qwerty");
    const asJcuken = charFromKeycode(e.keycode, shift, "jcuken");

    if (
      (asQwerty !== null && WORD_BOUNDARIES.has(asQwerty)) ||
      (asJcuken !== null && WORD_BOUNDARIES.has(asJcuken))
    ) {
      this.pendingBoundary = asQwerty && WORD_BOUNDARIES.has(asQwerty) ? asQwerty : asJcuken!;
      return;
    }

    if (asQwerty === null && asJcuken === null) {
      if (
        e.keycode !== UiohookKey.Shift &&
        e.keycode !== UiohookKey.ShiftRight &&
        e.keycode !== UiohookKey.CapsLock
      ) {
        this.clearBuffers();
      }
      return;
    }

    this.pendingBoundary = null;
    this.strokes.push({ keycode: e.keycode, shift });

    const keymap: "jcuken" | "qwerty" = state.mode === "forward" ? "jcuken" : "qwerty";
    const ch = charFromKeycode(e.keycode, shift, keymap);
    if (ch !== null && !WORD_BOUNDARIES.has(ch)) {
      this.wordBuffer += ch;
    }
  }

  private async flushWord(boundary: string): Promise<void> {
    const word = this.wordBuffer;
    const strokes = this.strokes;
    this.wordBuffer = "";
    this.strokes = [];
    if (!word && strokes.length === 0) return;

    const state = this.store.getState();
    if (state.mode === "off") return;

    const layout = this.store.getActiveLayout();
    const direction = state.mode === "forward" ? "forward" : "reverse";
    let converted: string | null = transliterateWord(word, layout, direction);
    if (converted === word) converted = null;
    const originalForUndo = word;
    const screenLen = strokes.length > 0 ? strokes.length : [...word].length;

    if (converted === null) {
      return;
    }

    if (converted === originalForUndo) {
      return;
    }

    const deleteCount = screenLen + [...boundary].length;
    const preferWordSelect =
      boundary.length > 0 && /^\s$/.test(boundary) && screenLen > 0;

    this.injecting = true;
    try {
      const result = await replaceLastChars(deleteCount, converted + boundary, {
        preferWordSelect,
      });
      if (result.ok) {
        this.lastReplacement = {
          original: originalForUndo,
          converted,
          boundary,
        };
      } else {
        console.error("Replace failed:", result.error);
      }
    } finally {
      this.injecting = false;
    }
  }
}
