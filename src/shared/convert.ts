import type { Layout } from "./types";
import { transliterateForward, transliterateReverse } from "./engine";

const LETTER = /\p{L}/u;

/**
 * Перегоняет только буквенные последовательности; пробелы, цифры и пунктуация сохраняются.
 */
export function transliterateLettersOnly(
  text: string,
  layout: Layout,
  direction: "forward" | "reverse",
): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (!LETTER.test(text[i])) {
      out += text[i];
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && LETTER.test(text[j])) j += 1;
    const word = text.slice(i, j);
    out +=
      direction === "forward"
        ? transliterateForward(word, layout)
        : transliterateReverse(word, layout);
    i = j;
  }
  return out;
}
