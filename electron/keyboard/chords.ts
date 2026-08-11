import { UiohookKey } from "uiohook-napi";
import { hotkeyNameToCode } from "./hotkeyMap";

export type ChordKind = "forward" | "reverse";

type ChordListener = (kind: ChordKind) => void;

/**
 * Ctrl + keyFirst затем keySecond → прямо
 * Ctrl + keySecond затем keyFirst → обратно
 */
export class ChordDetector {
  private ctrlDown = false;
  private chordKeysDown = new Set<number>();
  private letterOrder: number[] = [];
  private fired = false;
  private listener: ChordListener | null = null;
  private keyFirst: number = UiohookKey.A;
  private keySecond: number = UiohookKey.D;

  setChordKeys(firstName: string, secondName: string): void {
    const a = hotkeyNameToCode(firstName);
    const b = hotkeyNameToCode(secondName);
    if (a == null || b == null || a === b) return;
    this.keyFirst = a;
    this.keySecond = b;
    this.resetSequence();
  }

  onChord(listener: ChordListener): void {
    this.listener = listener;
  }

  isCtrlDown(): boolean {
    return this.ctrlDown;
  }

  handleKeyDown(keycode: number): boolean {
    if (keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight) {
      this.ctrlDown = true;
      return false;
    }

    if (!this.ctrlDown) {
      this.resetSequence();
      return false;
    }

    if (keycode === this.keyFirst || keycode === this.keySecond) {
      this.chordKeysDown.add(keycode);
      if (!this.letterOrder.includes(keycode)) {
        this.letterOrder.push(keycode);
      }
      return this.tryFire();
    }

    return false;
  }

  handleKeyUp(keycode: number): void {
    if (keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight) {
      this.ctrlDown = false;
      this.resetSequence();
      return;
    }

    this.chordKeysDown.delete(keycode);

    if (keycode === this.keyFirst || keycode === this.keySecond) {
      if (
        !this.chordKeysDown.has(this.keyFirst) ||
        !this.chordKeysDown.has(this.keySecond)
      ) {
        this.fired = false;
      }
    }
  }

  /** Аккорд или буквы аккорда при Ctrl — не печатать в буфер. */
  isChordKey(keycode: number): boolean {
    return (
      keycode === UiohookKey.Ctrl ||
      keycode === UiohookKey.CtrlRight ||
      keycode === this.keyFirst ||
      keycode === this.keySecond
    );
  }

  private tryFire(): boolean {
    if (this.fired || !this.ctrlDown) return false;
    if (
      !this.chordKeysDown.has(this.keyFirst) ||
      !this.chordKeysDown.has(this.keySecond)
    ) {
      return false;
    }

    const order = this.letterOrder.filter(
      (k) => k === this.keyFirst || k === this.keySecond,
    );
    const kind: ChordKind = order[0] === this.keySecond ? "reverse" : "forward";
    this.fired = true;
    this.listener?.(kind);
    return true;
  }

  private resetSequence(): void {
    this.chordKeysDown.clear();
    this.letterOrder = [];
    this.fired = false;
  }

  reset(): void {
    this.ctrlDown = false;
    this.resetSequence();
  }
}
