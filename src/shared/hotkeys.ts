/** Настраиваемые горячие клавиши (имена клавиш как в UiohookKey: A, D, F1…). */
export type HotkeysConfig = {
  /** Первая буква аккорда: Ctrl+first+second → прямой транслит. */
  chordFirst: string;
  /** Вторая буква: Ctrl+second+first → обратный. */
  chordSecond: string;
  /** Окно двойного Ctrl для отмены (мс). */
  undoDoubleCtrlMs: number;
  /** Включена ли отмена двойным Ctrl. */
  undoEnabled: boolean;
};

export const DEFAULT_HOTKEYS: HotkeysConfig = {
  chordFirst: "A",
  chordSecond: "D",
  undoDoubleCtrlMs: 400,
  undoEnabled: true,
};

const LETTER_RE = /^[A-Z]$/;
const DIGIT_RE = /^[0-9]$/;
const FKEY_RE = /^F([1-9]|1[0-2])$/;
const EXTRA = new Set([
  "Space",
  "Tab",
  "Enter",
  "Escape",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
  "Backquote",
]);

/** Нормализация имени клавиши из KeyboardEvent.code / key. */
export function normalizeHotkeyName(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (LETTER_RE.test(s.toUpperCase()) && s.length === 1) return s.toUpperCase();
  if (/^Key[A-Z]$/i.test(s)) return s.slice(3).toUpperCase();
  if (/^Digit[0-9]$/.test(s)) return s.slice(5); // store as "0"…"9"
  if (/^[0-9]$/.test(s)) return s;
  if (FKEY_RE.test(s.toUpperCase())) return s.toUpperCase();
  if (EXTRA.has(s)) return s;
  // Common aliases
  const aliases: Record<string, string> = {
    " ": "Space",
    Spacebar: "Space",
    Esc: "Escape",
    EscKey: "Escape",
    Return: "Enter",
    Left: "ArrowLeft",
    Right: "ArrowRight",
    Up: "ArrowUp",
    Down: "ArrowDown",
  };
  if (aliases[s]) return aliases[s];
  return null;
}

export function isValidHotkeyName(name: string): boolean {
  const n = normalizeHotkeyName(name);
  if (!n) return false;
  if (LETTER_RE.test(n)) return true;
  if (DIGIT_RE.test(n)) return true;
  if (FKEY_RE.test(n)) return true;
  return EXTRA.has(n);
}

export function migrateHotkeys(raw: unknown): HotkeysConfig {
  const d = DEFAULT_HOTKEYS;
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  const first = typeof o.chordFirst === "string" ? normalizeHotkeyName(o.chordFirst) : null;
  const second = typeof o.chordSecond === "string" ? normalizeHotkeyName(o.chordSecond) : null;
  let undoMs =
    typeof o.undoDoubleCtrlMs === "number" && Number.isFinite(o.undoDoubleCtrlMs)
      ? Math.round(o.undoDoubleCtrlMs)
      : d.undoDoubleCtrlMs;
  undoMs = Math.min(2000, Math.max(150, undoMs));
  return {
    chordFirst: first && isValidHotkeyName(first) ? first : d.chordFirst,
    chordSecond: second && isValidHotkeyName(second) ? second : d.chordSecond,
    undoDoubleCtrlMs: undoMs,
    undoEnabled: o.undoEnabled === undefined ? d.undoEnabled : Boolean(o.undoEnabled),
  };
}

export function formatChordLabel(first: string, second: string): string {
  return `Ctrl+${displayKey(first)}+${displayKey(second)}`;
}

export function displayKey(name: string): string {
  if (/^[0-9]$/.test(name)) return name;
  if (/^Digit([0-9])$/.test(name)) return name.slice(5);
  if (name === "Space") return "Space";
  if (name.startsWith("Arrow")) return name.replace("Arrow", "");
  if (name === "BracketLeft") return "[";
  if (name === "BracketRight") return "]";
  if (name === "Semicolon") return ";";
  if (name === "Quote") return "'";
  if (name === "Comma") return ",";
  if (name === "Period") return ".";
  if (name === "Slash") return "/";
  if (name === "Backslash") return "\\";
  if (name === "Minus") return "-";
  if (name === "Equal") return "=";
  if (name === "Backquote") return "`";
  return name;
}

/** Имя клавиши из browser KeyboardEvent. */
export function hotkeyFromKeyboardEvent(e: {
  key: string;
  code?: string;
}): string | null {
  if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") {
    return null;
  }
  if (e.code) {
    const fromCode = normalizeHotkeyName(e.code);
    if (fromCode) return fromCode;
  }
  return normalizeHotkeyName(e.key);
}
