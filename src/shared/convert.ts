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

export function textToBinary(text: string): string {
  if (!text) return "";
  const bytes = new TextEncoder().encode(text);
  return [...bytes].map((b) => b.toString(2).padStart(8, "0")).join(" ");
}

export function binaryToText(binary: string): string {
  const tokens = binary.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const bytes = tokens.map((t) => {
    if (!/^[01]{8}$/.test(t)) {
      throw new Error(`Invalid binary token: ${t}`);
    }
    return Number.parseInt(t, 2);
  });
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const MORSE_TABLE: Record<string, string> = {
  a: ".-",
  b: "-...",
  c: "-.-.",
  d: "-..",
  e: ".",
  f: "..-.",
  g: "--.",
  h: "....",
  i: "..",
  j: ".---",
  k: "-.-",
  l: ".-..",
  m: "--",
  n: "-.",
  o: "---",
  p: ".--.",
  q: "--.-",
  r: ".-.",
  s: "...",
  t: "-",
  u: "..-",
  v: "...-",
  w: ".--",
  x: "-..-",
  y: "-.--",
  z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "!": "-.-.--",
  "-": "-....-",
  "/": "-..-.",
  "@": ".--.-.",
  "(": "-.--.",
  ")": "-.--.-",
  "а": ".-",
  "б": "-...",
  "в": ".--",
  "г": "--.",
  "д": "-..",
  "е": ".",
  "ё": ".",
  "ж": "...-",
  "з": "--..",
  "и": "..",
  "й": ".---",
  "к": "-.-",
  "л": ".-..",
  "м": "--",
  "н": "-.",
  "о": "---",
  "п": ".--.",
  "р": ".-.",
  "с": "...",
  "т": "-",
  "у": "..-",
  "ф": "..-.",
  "х": "....",
  "ц": "-.-.",
  "ч": "---.",
  "ш": "----",
  "щ": "--.-",
  "ъ": "--.--",
  "ы": "-.--",
  "ь": "-..-",
  "э": "..-..",
  "ю": "..--",
  "я": ".-.-",
};

const MORSE_REVERSE = new Map<string, string>(
  Object.entries(MORSE_TABLE).map(([k, v]) => [v, k]),
);

export function textToMorse(text: string): string {
  if (!text) return "";
  const words = text.split(/\s+/).filter(Boolean);
  return words
    .map((w) =>
      [...w]
        .map((ch) => MORSE_TABLE[ch.toLocaleLowerCase("ru-RU")] ?? ch)
        .join(" "),
    )
    .join(" / ");
}

export function morseToText(morse: string): string {
  const words = morse.trim().split(/\s*\/\s*/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((word) =>
      word
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => {
          const ch = MORSE_REVERSE.get(token);
          if (!ch) throw new Error(`Invalid Morse token: ${token}`);
          return ch;
        })
        .join(""),
    )
    .join(" ");
}
