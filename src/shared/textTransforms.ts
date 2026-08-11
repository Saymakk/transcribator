export type CaseStyle =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "snake"
  | "kebab"
  | "camel"
  | "pascal"
  | "constant"
  | "dot"
  | "path"
  | "invert";

function splitWords(text: string): string[] {
  return text
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, "$1 $2")
    .replace(/[_\-.\\/]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function latinizeToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}]+/gu, "");
}

export function transformCase(text: string, style: CaseStyle): string {
  switch (style) {
    case "upper":
      return text.toLocaleUpperCase("ru-RU");
    case "lower":
      return text.toLocaleLowerCase("ru-RU");
    case "invert":
      return [...text]
        .map((ch) => {
          const lower = ch.toLocaleLowerCase("ru-RU");
          const upper = ch.toLocaleUpperCase("ru-RU");
          if (ch === lower && ch !== upper) return upper;
          if (ch === upper && ch !== lower) return lower;
          return ch;
        })
        .join("");
    case "title":
      return text.replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
        const first = word.charAt(0).toLocaleUpperCase("ru-RU");
        return first + word.slice(1).toLocaleLowerCase("ru-RU");
      });
    case "sentence": {
      let cap = true;
      return [...text]
        .map((ch) => {
          if (/[.!?…]/.test(ch)) {
            cap = true;
            return ch;
          }
          if (/\s/.test(ch)) return ch;
          if (/\p{L}/u.test(ch)) {
            const next = cap ? ch.toLocaleUpperCase("ru-RU") : ch.toLocaleLowerCase("ru-RU");
            cap = false;
            return next;
          }
          return ch;
        })
        .join("");
    }
    case "snake":
    case "kebab":
    case "dot":
    case "path":
    case "camel":
    case "pascal":
    case "constant": {
      const words = splitWords(text).map((w) => latinizeToken(w)).filter(Boolean);
      if (words.length === 0) return text;
      const sep =
        style === "snake" || style === "constant"
          ? "_"
          : style === "kebab"
            ? "-"
            : style === "dot"
              ? "."
              : style === "path"
                ? "/"
                : "";
      if (style === "camel") {
        return words
          .map((w, i) => {
            const low = w.toLocaleLowerCase("en-US");
            if (i === 0) return low;
            return low.charAt(0).toLocaleUpperCase("en-US") + low.slice(1);
          })
          .join("");
      }
      if (style === "pascal") {
        return words
          .map((w) => {
            const low = w.toLocaleLowerCase("en-US");
            return low.charAt(0).toLocaleUpperCase("en-US") + low.slice(1);
          })
          .join("");
      }
      if (style === "constant") {
        return words.map((w) => w.toLocaleUpperCase("en-US")).join(sep);
      }
      return words.map((w) => w.toLocaleLowerCase("en-US")).join(sep);
    }
    default:
      return text;
  }
}

export type WrapStyle = "none" | "quotes" | "double" | "backtick" | "paren" | "bracket" | "brace" | "angle" | "custom";

export function wrapLines(
  text: string,
  style: WrapStyle,
  customLeft = "",
  customRight = "",
): string {
  let left = "";
  let right = "";
  switch (style) {
    case "quotes":
      left = "'";
      right = "'";
      break;
    case "double":
      left = '"';
      right = '"';
      break;
    case "backtick":
      left = "`";
      right = "`";
      break;
    case "paren":
      left = "(";
      right = ")";
      break;
    case "bracket":
      left = "[";
      right = "]";
      break;
    case "brace":
      left = "{";
      right = "}";
      break;
    case "angle":
      left = "<";
      right = ">";
      break;
    case "custom":
      left = customLeft;
      right = customRight || customLeft;
      break;
    default:
      return text;
  }
  return text
    .split(/\r?\n/)
    .map((line) => (line.length === 0 ? line : `${left}${line}${right}`))
    .join("\n");
}
