/**
 * Замена последнего фрагмента одним «превращением»:
 * выделить блок → одна вставка (без Backspace по буквам и без перепечатки).
 */
import { uIOhook, UiohookKey } from "uiohook-napi";
import { clipboard } from "electron";

export type ReplaceResult = {
  ok: boolean;
  error?: string;
};

const CTRL = [UiohookKey.Ctrl];
const SHIFT = [UiohookKey.Shift];
const CTRL_SHIFT = [UiohookKey.Ctrl, UiohookKey.Shift];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Выделяет `charCount` символов слева от курсора.
 * Для типичного «слово + разделитель» — 2 нажатия (меньше артефактов),
 * иначе — посимвольно Shift+←.
 */
function selectPreviousChars(charCount: number, preferWordSelect: boolean): void {
  if (charCount <= 0) return;

  if (preferWordSelect && charCount >= 2) {
    // Курсор стоит после разделителя: сначала сам разделитель, затем слово целиком.
    uIOhook.keyTap(UiohookKey.ArrowLeft, SHIFT);
    uIOhook.keyTap(UiohookKey.ArrowLeft, CTRL_SHIFT);
    return;
  }

  for (let i = 0; i < charCount; i += 1) {
    uIOhook.keyTap(UiohookKey.ArrowLeft, SHIFT);
  }
}

/**
 * Заменяет последние `charCount` символов на `text` одним выделением + вставкой.
 */
export async function replaceLastChars(
  charCount: number,
  text: string,
  options?: { preferWordSelect?: boolean },
): Promise<ReplaceResult> {
  if (charCount <= 0 && !text) return { ok: true };

  try {
    if (charCount > 0) {
      selectPreviousChars(charCount, options?.preferWordSelect !== false);
      await sleep(6);
    }

    if (!text) {
      uIOhook.keyTap(UiohookKey.Backspace);
      await sleep(12);
      return { ok: true };
    }

    const previous = clipboard.readText();
    clipboard.writeText(text);
    await sleep(8);

    if (process.platform === "darwin") {
      uIOhook.keyTap(UiohookKey.V, [UiohookKey.Meta]);
    } else {
      uIOhook.keyTap(UiohookKey.V, CTRL);
    }

    await sleep(50);
    try {
      clipboard.writeText(previous);
    } catch {
      /* ignore */
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
