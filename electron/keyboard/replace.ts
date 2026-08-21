/**
 * Замена последнего фрагмента: сначала стереть исходник (Backspace × N),
 * затем одна вставка. Выделение+Ctrl+V часто не снимает кириллицу в части
 * приложений — на экране оставались оба варианта слова.
 */
import { uIOhook, UiohookKey } from "uiohook-napi";
import { clipboard } from "electron";

export type ReplaceResult = {
  ok: boolean;
  error?: string;
};

const CTRL = [UiohookKey.Ctrl];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Удаляет `charCount` символов слева от курсора. */
async function deletePreviousChars(charCount: number): Promise<void> {
  if (charCount <= 0) return;
  for (let i = 0; i < charCount; i += 1) {
    uIOhook.keyTap(UiohookKey.Backspace);
    // Даём целевому полю успевать обрабатывать длинные слова
    if ((i + 1) % 12 === 0) await sleep(3);
  }
  await sleep(10);
}

async function pasteText(text: string): Promise<void> {
  const previous = clipboard.readText();
  clipboard.writeText(text);
  await sleep(8);

  if (process.platform === "darwin") {
    uIOhook.keyTap(UiohookKey.V, [UiohookKey.Meta]);
  } else {
    uIOhook.keyTap(UiohookKey.V, CTRL);
  }

  await sleep(28);
  try {
    clipboard.writeText(previous);
  } catch {
    /* ignore */
  }
}

/**
 * Заменяет последние `charCount` символов на `text`.
 * `preferWordSelect` оставлен для совместимости вызовов (больше не используется).
 */
export async function replaceLastChars(
  charCount: number,
  text: string,
  _options?: { preferWordSelect?: boolean },
): Promise<ReplaceResult> {
  if (charCount <= 0 && !text) return { ok: true };

  try {
    await deletePreviousChars(charCount);

    if (!text) {
      return { ok: true };
    }

    await pasteText(text);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
