import type { Layout } from "../shared/types";

/** Expand lowercase RU→symbol pairs with uppercase counterparts. */
function withRuCase(pairs: Array<{ from: string; to: string }>): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>();
  for (const { from, to } of pairs) {
    if (!from || seen.has(from)) continue;
    seen.add(from);
    out.push({ from, to });
    const From = from.toLocaleUpperCase("ru-RU");
    if (From !== from && !seen.has(From)) {
      seen.add(From);
      const To = !to
        ? to
        : /[\u2C00-\u2C5F]/.test(to)
          ? [...to]
              .map((ch) => {
                const cp = ch.codePointAt(0)!;
                return cp >= 0x2c30 && cp <= 0x2c5f
                  ? String.fromCodePoint(cp - 0x30)
                  : ch;
              })
              .join("")
          : to.toLocaleUpperCase("en-US");
      out.push({ from: From, to: To });
    }
    if (from.length > 1) {
      const Title =
        from.charAt(0).toLocaleUpperCase("ru-RU") + from.slice(1).toLocaleLowerCase("ru-RU");
      if (Title !== from && Title !== From && !seen.has(Title)) {
        seen.add(Title);
        const titleTo = !to
          ? to
          : to.length === 1
            ? to.toLocaleUpperCase("en-US")
            : to.charAt(0).toLocaleUpperCase("en-US") + to.slice(1);
        out.push({ from: Title, to: titleTo });
      }
    }
  }
  return out;
}

/** Фонетическая латиница с диакритикой — стартовый набор правил (строчные и заглавные). */
export function createDefaultLayout(): Layout {
  return {
    id: "default-phonetic",
    name: "Фонетическая",
    rules: withRuCase([
      { from: "а", to: "a" },
      { from: "б", to: "b" },
      { from: "в", to: "v" },
      { from: "г", to: "g" },
      { from: "д", to: "d" },
      { from: "е", to: "e" },
      { from: "ё", to: "ë" },
      { from: "ж", to: "ž" },
      { from: "з", to: "z" },
      { from: "и", to: "i" },
      { from: "й", to: "j" },
      { from: "к", to: "k" },
      { from: "л", to: "l" },
      { from: "м", to: "m" },
      { from: "н", to: "n" },
      { from: "о", to: "o" },
      { from: "п", to: "p" },
      { from: "р", to: "r" },
      { from: "с", to: "s" },
      { from: "т", to: "t" },
      { from: "у", to: "u" },
      { from: "ф", to: "f" },
      { from: "х", to: "h" },
      { from: "ц", to: "c" },
      { from: "ч", to: "č" },
      { from: "ш", to: "š" },
      { from: "щ", to: "ŝ" },
      { from: "ъ", to: "ʺ" },
      { from: "ы", to: "y" },
      { from: "ь", to: "ʹ" },
      { from: "э", to: "è" },
      { from: "ю", to: "ju" },
      { from: "я", to: "ja" },
      { from: "дж", to: "ǯ" },
      { from: "тс", to: "c̄" },
    ]),
  };
}
