import type { LayoutRule } from "./types";
import { ALPHABETS, buildIdentityRulesFromSymbols, type AlphabetDef } from "./alphabetLayouts";
import { alignAlphabetToLayout, phoneticFromForSymbol } from "./phoneticAlign";
import { withRuleIds } from "./ruleIds";

export type SymbolGroup = {
  /** Stable id for i18n (`palette.<id>`) or custom uuid. */
  id: string;
  /** Display name for custom groups (built-ins use i18n). */
  name?: string;
  custom?: boolean;
  defaultOpen?: boolean;
  symbols: string[];
};

function uniq(symbols: string[]): string[] {
  return [...new Set(symbols)];
}

/** Built-in decorative / diacritic packs without full layout maps. */
const EXTRA_GROUPS: SymbolGroup[] = [
  {
    id: "czechSlovak",
    symbols: uniq([
      "a", "á", "A", "Á", "ǎ", "Ǎ", "b", "B", "c", "č", "C", "Č", "d", "ď", "D", "Ď", "e", "é", "E", "É",
      "ě", "Ě", "f", "F", "g", "G", "h", "H", "i", "í", "ǐ", "I", "Í", "Ǐ", "j", "J", "k", "K", "l", "L",
      "m", "M", "n", "ň", "N", "Ň", "o", "ó", "ǒ", "O", "Ó", "Ǒ", "p", "P", "q", "Q", "r", "ř", "R", "Ř",
      "s", "š", "S", "Š", "t", "ť", "T", "Ť", "u", "ú", "ǔ", "U", "Ú", "Ǔ", "ů", "Ů", "v", "V", "w", "W",
      "x", "X", "y", "ý", "Y", "Ý", "z", "ž", "Z", "Ž",
    ]),
  },
  {
    id: "serboCroatian",
    symbols: uniq([
      "a", "A", "b", "B", "c", "C", "č", "Č", "ć", "Ć", "d", "D", "đ", "Đ",
      "e", "E", "f", "F", "g", "G", "h", "H", "i", "I", "j", "J", "k", "K", "l", "L",
      "m", "M", "n", "N", "o", "O", "p", "P", "r", "R", "s", "S", "š", "Š",
      "t", "T", "u", "U", "v", "V", "z", "Z", "ž", "Ž",
    ]),
  },
  {
    id: "digraphs",
    symbols: uniq(["dž", "Dž", "DŽ", "lj", "Lj", "LJ", "nj", "Nj", "NJ"]),
  },
  {
    id: "hungarian",
    symbols: uniq([
      "a", "á", "A", "Á", "b", "B", "c", "C", "d", "D", "e", "é", "E", "É", "f", "F", "g", "G",
      "h", "H", "i", "í", "I", "Í", "j", "J", "k", "K", "l", "L", "m", "M", "n", "N", "o", "ó",
      "O", "Ó", "ö", "Ö", "ő", "Ő", "p", "P", "r", "R", "s", "S", "t", "T", "u", "ú",
      "U", "Ú", "ü", "Ü", "ű", "Ű", "v", "V", "w", "W", "x", "X", "y", "Y", "z", "Z",
    ]),
  },
  {
    id: "romanian",
    symbols: uniq([
      "a", "A", "ă", "Ă", "â", "Â", "b", "B", "c", "C", "d", "D", "e", "E", "f", "F", "g", "G",
      "h", "H", "i", "I", "î", "Î", "j", "J", "k", "K", "l", "L", "m", "M", "n", "N", "o", "O",
      "p", "P", "r", "R", "s", "S", "ș", "Ș", "t", "T", "ț", "Ț", "u", "U", "v", "V",
      "w", "W", "x", "X", "y", "Y", "z", "Z",
    ]),
  },
  {
    id: "baltic",
    symbols: uniq([
      "a", "ā", "A", "Ā", "b", "B", "c", "C", "č", "Č", "d", "D", "e", "ē", "E", "Ē", "f", "F",
      "g", "G", "ģ", "Ģ", "h", "H", "i", "ī", "I", "Ī", "j", "J", "k", "K", "ķ", "Ķ", "l", "L",
      "ļ", "Ļ", "m", "M", "n", "N", "ņ", "Ņ", "o", "ō", "O", "Ō", "p", "P", "r", "R",
      "s", "S", "š", "Š", "t", "T", "u", "ū", "U", "Ū", "v", "V", "z", "Z", "ž", "Ž",
      "ą", "Ą", "ę", "Ę", "ė", "Ė", "į", "Į", "ų", "Ų",
    ]),
  },
  {
    id: "icelandic",
    symbols: uniq([
      "a", "á", "A", "Á", "b", "B", "d", "ð", "D", "Ð", "e", "é", "E", "É", "f", "F", "g", "G",
      "h", "H", "i", "í", "I", "Í", "j", "J", "k", "K", "l", "L", "m", "M", "n", "N", "o", "ó",
      "O", "Ó", "p", "P", "r", "R", "s", "S", "t", "T", "u", "ú", "U", "Ú", "v", "V", "x", "X",
      "y", "ý", "Y", "Ý", "z", "Z", "þ", "Þ", "æ", "Æ", "ö", "Ö",
    ]),
  },
  {
    id: "germanic",
    symbols: uniq([
      "a", "A", "ä", "Ä", "b", "B", "c", "C", "d", "D", "e", "E", "f", "F", "g", "G", "h", "H",
      "i", "I", "j", "J", "k", "K", "l", "L", "m", "M", "n", "N", "o", "ö", "O", "Ö", "p", "P",
      "q", "Q", "r", "R", "s", "S", "ß", "t", "T", "u", "ü", "U", "Ü", "v", "V", "w", "W", "x", "X",
      "y", "Y", "z", "Z", "å", "Å", "æ", "Æ", "ø", "Ø",
    ]),
  },
  {
    id: "romance",
    symbols: uniq([
      "a", "à", "á", "â", "ã", "ä", "å", "A", "À", "Á", "Â", "Ã", "Ä", "Å",
      "c", "ç", "C", "Ç", "e", "è", "é", "ê", "ë", "E", "È", "É", "Ê", "Ë",
      "i", "ì", "í", "î", "ï", "I", "Ì", "Í", "Î", "Ï",
      "n", "ñ", "N", "Ñ", "o", "ò", "ó", "ô", "õ", "ö", "O", "Ò", "Ó", "Ô", "Õ", "Ö",
      "u", "ù", "ú", "û", "ü", "U", "Ù", "Ú", "Û", "Ü",
      "y", "ý", "ÿ", "Y", "Ý", "Ÿ",
    ]),
  },
  {
    id: "slavicLatin",
    symbols: uniq([
      "č", "Č", "ć", "Ć", "ĉ", "Ĉ", "ď", "Ď", "đ", "Đ", "ě", "Ě", "ǐ", "Ǐ", "ł", "Ł", "ń", "Ń", "ň", "Ň",
      "ř", "Ř", "ś", "Ś", "š", "Š", "ŝ", "Ŝ", "ť", "Ť", "ů", "Ů", "ź", "Ź", "ż", "Ż", "ž", "Ž",
      "ǎ", "Ǎ", "ǒ", "Ǒ", "ǔ", "Ǔ", "ĝ", "Ĝ", "ĥ", "Ĥ", "ĵ", "Ĵ", "ŭ", "Ŭ",
    ]),
  },
  {
    id: "diacritics",
    symbols: uniq([
      "á", "à", "â", "ä", "ã", "å", "ā", "ă", "ą", "Á", "À", "Â", "Ä", "Ã", "Å", "Ā", "Ă", "Ą",
      "é", "è", "ê", "ë", "ē", "ė", "ę", "ě", "É", "È", "Ê", "Ë", "Ē", "Ė", "Ę", "Ě",
      "í", "ì", "î", "ï", "ī", "į", "ĩ", "ǐ", "Í", "Ì", "Î", "Ï", "Ī", "Į", "Ĩ", "Ǐ",
      "ó", "ò", "ô", "ö", "õ", "ō", "ő", "ø", "ǒ", "Ó", "Ò", "Ô", "Ö", "Õ", "Ō", "Ő", "Ø", "Ǒ",
      "ú", "ù", "û", "ü", "ū", "ů", "ű", "ũ", "ǔ", "Ú", "Ù", "Û", "Ü", "Ū", "Ů", "Ű", "Ũ", "Ǔ",
      "ý", "ÿ", "ŷ", "Ý", "Ÿ", "Ŷ", "ç", "Ç", "ĉ", "Ĉ", "ñ", "Ñ", "ş", "Ş", "ŝ", "Ŝ", "ğ", "Ğ", "ĝ", "Ĝ",
      "ĥ", "Ĥ", "ĵ", "Ĵ", "ŭ", "Ŭ", "ı", "İ",
      "ǎ", "Ǎ", "ě", "Ě",
      "œ", "Œ", "æ", "Æ", "ß", "ð", "Ð", "þ", "Þ", "ł", "Ł", "đ", "Đ",
    ]),
  },
  {
    id: "combining",
    symbols: uniq([
      "̀", "́", "̂", "̃", "̄", "̆", "̇", "̈", "̉", "̊", "̋", "̌", "̍", "̎", "̏", "̑",
      "̣", "̤", "̥", "̦", "̧", "̨", "̩", "̪", "̫", "̬", "̭", "̮", "̯", "̰", "̱",
      "ˊ", "ˋ", "ˆ", "ˇ", "˘", "˙", "˚", "˛", "˜", "¯", "¨", "¸", "˝",
    ]),
  },
  {
    id: "ipa",
    symbols: uniq([
      "ɑ", "ɒ", "æ", "ɐ", "ə", "ɚ", "ɜ", "ɝ", "ɞ", "ɘ", "ɤ", "ɨ", "ɯ", "ɪ", "ʏ", "ʊ", "ø", "œ",
      "ɛ", "ʌ", "ɔ", "β", "ð", "θ", "ʃ", "ʒ", "ŋ", "ɲ", "ɱ", "ɾ", "ɹ", "ʁ", "χ", "ʔ",
    ]),
  },
  {
    id: "vietnamese",
    symbols: uniq([
      "à", "á", "ả", "ã", "ạ", "ă", "ằ", "ắ", "ẳ", "ẵ", "ặ", "â", "ầ", "ấ", "ẩ", "ẫ", "ậ",
      "è", "é", "ẻ", "ẽ", "ẹ", "ê", "ề", "ế", "ể", "ễ", "ệ",
      "ì", "í", "ỉ", "ĩ", "ị", "ò", "ó", "ỏ", "õ", "ọ", "ô", "ồ", "ố", "ổ", "ỗ", "ộ",
      "ơ", "ờ", "ớ", "ở", "ỡ", "ợ", "ù", "ú", "ủ", "ũ", "ụ", "ư", "ừ", "ứ", "ử", "ữ", "ự",
      "ỳ", "ý", "ỷ", "ỹ", "ỵ", "đ", "Đ",
    ]),
  },
  {
    id: "misc",
    symbols: uniq([
      "-", "‑", "–", "—", "'", "′", "″", "·", "•", "°", "§", "¶",
      "«", "»", "„", "“", "”", "‚", "‘", "’", "…", "¿", "¡", "№",
    ]),
  },
];

export const SYMBOL_PALETTE: SymbolGroup[] = [
  ...ALPHABETS.map(
    (a): SymbolGroup => ({
      id: a.id,
      defaultOpen: a.defaultOpen,
      symbols: a.symbols,
    }),
  ),
  ...EXTRA_GROUPS,
];

export function mergePaletteGroups(
  builtin: SymbolGroup[],
  custom: Array<{ id: string; name: string; symbols: string[] }>,
): SymbolGroup[] {
  const customs: SymbolGroup[] = custom.map((c) => ({
    id: c.id,
    name: c.name,
    custom: true,
    defaultOpen: true,
    symbols: uniq(c.symbols),
  }));
  return [...customs, ...builtin];
}

export function layoutRulesForGroup(id: string): LayoutRule[] | null {
  const alpha = ALPHABETS.find((a) => a.id === id);
  return alpha ? alpha.layoutRules : null;
}

export function getAlphabetDef(id: string): AlphabetDef | undefined {
  return ALPHABETS.find((a) => a.id === id);
}

/**
 * Правила для кнопки «как раскладка»:
 * выравнивание по звучанию к RU; нет совпадения — пустая ячейка.
 */
export function rulesForPaletteApply(
  groupId: string,
  symbols: string[],
): LayoutRule[] | null {
  const mapped = layoutRulesForGroup(groupId);
  if ((!mapped || mapped.length === 0) && symbols.length === 0) return null;
  const aligned = alignAlphabetToLayout(symbols, mapped);
  return aligned.length > 0 ? aligned : null;
}

/** Соответствующий «from» для символа палитры. */
export function correspondingFromForSymbol(
  groupId: string,
  symbol: string,
  _symbols: string[],
): string | null {
  const mapped = layoutRulesForGroup(groupId);
  const from = phoneticFromForSymbol(symbol, mapped);
  return from || null;
}

/** @deprecated kept for callers that want raw identity pairing */
export function identityRulesForSymbols(symbols: string[]): LayoutRule[] {
  return withRuleIds(buildIdentityRulesFromSymbols(symbols));
}
