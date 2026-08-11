import type { LayoutRule } from "./types";

export type AlphabetKind = "latin" | "cyrillic" | "script";

export type AlphabetDef = {
  id: string;
  kind: AlphabetKind;
  /** Characters for the symbol palette. */
  symbols: string[];
  /** RU (or latin phonetic) → alphabet rules for “use as layout”. */
  layoutRules: LayoutRule[];
  defaultOpen?: boolean;
};

function uniq(symbols: string[]): string[] {
  return [...new Set(symbols)];
}

function glagoliticUpperChar(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return ch;
  // Small Glagolitic U+2C30–U+2C5F → capital U+2C00–U+2C2F
  if (cp >= 0x2c30 && cp <= 0x2c5f) return String.fromCodePoint(cp - 0x30);
  return ch;
}

function upperTarget(to: string): string {
  if (!to) return to;
  // Glagolitic small → capital
  if (/[\u2C00-\u2C5F]/.test(to)) {
    return [...to].map(glagoliticUpperChar).join("");
  }
  // Armenian
  if (/[\u0530-\u058F]/.test(to)) {
    return to.toLocaleUpperCase("hy-AM");
  }
  // Latin / Cyrillic / other cased scripts: full uppercase
  return to.toLocaleUpperCase("en-US");
}

/**
 * Builds layout rules with both lowercase and uppercase Cyrillic sources.
 * Uppercase Cyrillic maps to an uppercased target when the script has case.
 */
function withCase(map: Array<[string, string]>): LayoutRule[] {
  const out: LayoutRule[] = [];
  const seen = new Set<string>();
  const push = (from: string, to: string) => {
    if (!from || seen.has(from)) return;
    seen.add(from);
    out.push({ from, to });
  };

  for (const [from, to] of map) {
    push(from, to);
    const From = from.toLocaleUpperCase("ru-RU");
    if (From !== from) {
      push(From, upperTarget(to));
    }
    // Title-style for multi-letter keys: Дж → …
    if (from.length > 1) {
      const Title =
        from.charAt(0).toLocaleUpperCase("ru-RU") + from.slice(1).toLocaleLowerCase("ru-RU");
      if (Title !== from && Title !== From) {
        const titleTo =
          to.length <= 1
            ? upperTarget(to)
            : upperTarget(to.charAt(0)) + to.slice(1);
        push(Title, titleTo);
      }
    }
  }
  return out;
}

/** @deprecated alias — always expands case now */
function rules(pairs: Array<[string, string]>): LayoutRule[] {
  return withCase(pairs);
}

const RU_LATIN_BASE: Array<[string, string]> = [
  ["а", "a"],
  ["б", "b"],
  ["в", "v"],
  ["г", "g"],
  ["д", "d"],
  ["е", "e"],
  ["ё", "yo"],
  ["ж", "zh"],
  ["з", "z"],
  ["и", "i"],
  ["й", "y"],
  ["к", "k"],
  ["л", "l"],
  ["м", "m"],
  ["н", "n"],
  ["о", "o"],
  ["п", "p"],
  ["р", "r"],
  ["с", "s"],
  ["т", "t"],
  ["у", "u"],
  ["ф", "f"],
  ["х", "h"],
  ["ц", "ts"],
  ["ч", "ch"],
  ["ш", "sh"],
  ["щ", "shch"],
  ["ъ", "'"],
  ["ы", "y"],
  ["ь", "'"],
  ["э", "e"],
  ["ю", "yu"],
  ["я", "ya"],
];

export const ALPHABETS: AlphabetDef[] = [
  {
    id: "latin",
    kind: "latin",
    defaultOpen: true,
    symbols: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    layoutRules: withCase([
      ["а", "a"],
      ["б", "b"],
      ["в", "v"],
      ["г", "g"],
      ["д", "d"],
      ["е", "e"],
      ["ё", "ë"],
      ["ж", "zh"],
      ["з", "z"],
      ["и", "i"],
      ["й", "j"],
      ["к", "k"],
      ["л", "l"],
      ["м", "m"],
      ["н", "n"],
      ["о", "o"],
      ["п", "p"],
      ["р", "r"],
      ["с", "s"],
      ["т", "t"],
      ["у", "u"],
      ["ф", "f"],
      ["х", "h"],
      ["ц", "c"],
      ["ч", "ch"],
      ["ш", "sh"],
      ["щ", "sch"],
      ["ъ", ""],
      ["ы", "y"],
      ["ь", ""],
      ["э", "e"],
      ["ю", "yu"],
      ["я", "ya"],
    ]),
  },
  {
    id: "georgian",
    kind: "script",
    defaultOpen: true,
    symbols: uniq([..."აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ"]),
    layoutRules: rules([
      ["а", "ა"],
      ["б", "ბ"],
      ["в", "ვ"],
      ["г", "გ"],
      ["д", "დ"],
      ["е", "ე"],
      ["ё", "იო"],
      ["ж", "ჟ"],
      ["з", "ზ"],
      ["и", "ი"],
      ["й", "ი"],
      ["к", "კ"],
      ["л", "ლ"],
      ["м", "მ"],
      ["н", "ნ"],
      ["о", "ო"],
      ["п", "პ"],
      ["р", "რ"],
      ["с", "ს"],
      ["т", "ტ"],
      ["у", "უ"],
      ["ф", "ფ"],
      ["х", "ხ"],
      ["ц", "ც"],
      ["ч", "ჩ"],
      ["ш", "შ"],
      ["щ", "შჩ"],
      ["ы", "ი"],
      ["э", "ე"],
      ["ю", "იუ"],
      ["я", "ია"],
      ["гъ", "ღ"],
      ["кь", "ქ"],
      ["тш", "ჭ"],
      ["дз", "ძ"],
      ["тц", "წ"],
      ["кх", "ყ"],
      ["хх", "ჰ"],
    ]),
  },
  {
    id: "armenian",
    kind: "script",
    defaultOpen: true,
    symbols: uniq([
      ..."աբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆև",
      ..."ԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖ",
    ]),
    layoutRules: rules([
      ["а", "ա"],
      ["б", "բ"],
      ["в", "վ"],
      ["г", "գ"],
      ["д", "դ"],
      ["е", "ե"],
      ["ё", "յո"],
      ["ж", "ժ"],
      ["з", "զ"],
      ["и", "ի"],
      ["й", "յ"],
      ["к", "կ"],
      ["л", "լ"],
      ["м", "մ"],
      ["н", "ն"],
      ["о", "ո"],
      ["п", "պ"],
      ["р", "ր"],
      ["с", "ս"],
      ["т", "տ"],
      ["у", "ու"],
      ["ф", "ֆ"],
      ["х", "խ"],
      ["ц", "ց"],
      ["ч", "չ"],
      ["ш", "շ"],
      ["щ", "շչ"],
      ["ы", "ը"],
      ["э", "է"],
      ["ю", "յու"],
      ["я", "յա"],
      ["гх", "ղ"],
      ["тш", "ճ"],
      ["дж", "ջ"],
      ["рр", "ռ"],
      ["пх", "փ"],
      ["кх", "ք"],
      ["о́", "օ"],
      ["ев", "և"],
    ]),
  },
  {
    id: "hindi",
    kind: "script",
    defaultOpen: true,
    symbols: uniq([
      ..."अआइईउऊऋएऐओऔअंअः",
      ..."कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह",
      ..."क़ख़ग़ज़फ़",
      ..."ािीुूृेैोौंः्",
      ..."०१२३४५६७८९",
    ]),
    layoutRules: rules([
      ["а", "अ"],
      ["аа", "आ"],
      ["и", "इ"],
      ["ии", "ई"],
      ["у", "उ"],
      ["уу", "ऊ"],
      ["ри", "ऋ"],
      ["е", "ए"],
      ["аи", "ऐ"],
      ["о", "ओ"],
      ["ау", "औ"],
      ["к", "क"],
      ["кх", "ख"],
      ["г", "ग"],
      ["гх", "घ"],
      ["нн", "ङ"],
      ["ч", "च"],
      ["чх", "छ"],
      ["дж", "ज"],
      ["джх", "झ"],
      ["нь", "ञ"],
      ["т", "ट"],
      ["тх", "ठ"],
      ["д", "ड"],
      ["дх", "ढ"],
      ["н", "न"],
      ["п", "प"],
      ["пх", "फ"],
      ["б", "ब"],
      ["бх", "भ"],
      ["м", "म"],
      ["й", "य"],
      ["р", "र"],
      ["л", "ल"],
      ["в", "व"],
      ["ш", "श"],
      ["шш", "ष"],
      ["с", "स"],
      ["х", "ह"],
      ["к'", "क़"],
      ["г'", "ग़"],
      ["з", "ज़"],
      ["ф", "फ़"],
      ["м'", "ं"],
      ["х'", "ः"],
    ]),
  },
  {
    id: "hebrew",
    kind: "script",
    defaultOpen: true,
    symbols: uniq([..."אבגדהוזחטיכלמנסעפצקרשתךםןףץ"]),
    layoutRules: rules([
      ["а", "א"],
      ["б", "ב"],
      ["в", "ב"],
      ["г", "ג"],
      ["д", "ד"],
      ["е", "ה"],
      ["ё", "יו"],
      ["ж", "ז׳"],
      ["з", "ז"],
      ["и", "י"],
      ["й", "י"],
      ["к", "כ"],
      ["л", "ל"],
      ["м", "מ"],
      ["н", "נ"],
      ["о", "ו"],
      ["п", "פ"],
      ["р", "ר"],
      ["с", "ס"],
      ["т", "ת"],
      ["у", "ו"],
      ["ф", "פ"],
      ["х", "ח"],
      ["ц", "צ"],
      ["ч", "צ׳"],
      ["ш", "ש"],
      ["щ", "ש׳"],
      ["э", "ע"],
      ["ю", "יו"],
      ["я", "יה"],
      ["кк", "ק"],
      ["тт", "ט"],
      ["сс", "ש"],
      ["хх", "כ"],
    ]),
  },
  {
    id: "quenya",
    kind: "latin",
    defaultOpen: true,
    symbols: uniq([
      ..."aábcdefghijklmnoprstuvwxyz",
      ..."AÁBCDEFGHIJKLMNOPRSTUVWXYZ",
      "ë",
      "Ë",
      "ñ",
      "Ñ",
      "þ",
      "Þ",
      "ö",
      "Ö",
    ]),
    layoutRules: withCase([
      ["а", "a"],
      ["á", "á"],
      ["б", "b"],
      ["в", "v"],
      ["г", "g"],
      ["д", "d"],
      ["е", "e"],
      ["ё", "ë"],
      ["ж", "j"],
      ["з", "z"],
      ["и", "i"],
      ["й", "y"],
      ["к", "c"],
      ["л", "l"],
      ["м", "m"],
      ["н", "n"],
      ["о", "o"],
      ["п", "p"],
      ["р", "r"],
      ["с", "s"],
      ["т", "t"],
      ["у", "u"],
      ["ф", "f"],
      ["х", "h"],
      ["ц", "ts"],
      ["ч", "ty"],
      ["ш", "sy"],
      ["щ", "hy"],
      ["ы", "y"],
      ["э", "e"],
      ["ю", "yu"],
      ["я", "ya"],
      ["нг", "ñ"],
      ["тх", "þ"],
      ["кв", "qu"],
      ["гв", "gw"],
      ["нь", "ny"],
      ["ль", "ly"],
    ]),
  },
  {
    id: "glagolitic",
    kind: "script",
    symbols: uniq([
      ..."ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮ",
      ..."ⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞ",
    ]),
    layoutRules: rules([
      ["а", "ⰰ"],
      ["б", "ⰱ"],
      ["в", "ⰲ"],
      ["г", "ⰳ"],
      ["д", "ⰴ"],
      ["е", "ⰵ"],
      ["ё", "ⰵ"],
      ["ж", "ⰶ"],
      ["ѕ", "ⰷ"],
      ["з", "ⰸ"],
      ["и", "ⰹ"],
      ["й", "ⰺ"],
      ["к", "ⰽ"],
      ["л", "ⰾ"],
      ["м", "ⰿ"],
      ["н", "ⱀ"],
      ["о", "ⱁ"],
      ["п", "ⱂ"],
      ["р", "ⱃ"],
      ["с", "ⱄ"],
      ["т", "ⱅ"],
      ["у", "ⱆ"],
      ["ф", "ⱇ"],
      ["х", "ⱈ"],
      ["от", "ⱉ"],
      ["щ", "ⱊ"],
      ["ц", "ⱌ"],
      ["ч", "ⱍ"],
      ["ш", "ⱎ"],
      ["ъ", "ⱏ"],
      ["ы", "ⱏⰹ"],
      ["ь", "ⱐ"],
      ["ять", "ⱑ"],
      ["ю", "ⱓ"],
      ["я", "ⱔ"],
      ["э", "ⱔ"],
      ["кс", "ⱛ"],
      ["пс", "ⱜ"],
      ["фь", "ⱝ"],
      ["ижица", "ⱞ"],
    ]),
  },
  {
    id: "korean",
    kind: "script",
    symbols: uniq([
      ..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ",
      ..."ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ",
      ..."가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허",
      ..."고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후",
      ..."한글",
    ]),
    layoutRules: rules([
      ["а", "ㅏ"],
      ["я", "ㅑ"],
      ["э", "ㅓ"],
      ["е", "ㅔ"],
      ["ё", "ㅕ"],
      ["о", "ㅗ"],
      ["ёо", "ㅛ"],
      ["у", "ㅜ"],
      ["ю", "ㅠ"],
      ["ы", "ㅡ"],
      ["и", "ㅣ"],
      ["б", "ㅂ"],
      ["п", "ㅍ"],
      ["пп", "ㅃ"],
      ["д", "ㄷ"],
      ["т", "ㅌ"],
      ["тт", "ㄸ"],
      ["г", "ㄱ"],
      ["к", "ㅋ"],
      ["кк", "ㄲ"],
      ["дж", "ㅈ"],
      ["ч", "ㅊ"],
      ["чч", "ㅉ"],
      ["с", "ㅅ"],
      ["сс", "ㅆ"],
      ["м", "ㅁ"],
      ["н", "ㄴ"],
      ["нн", "ㅇ"],
      ["р", "ㄹ"],
      ["л", "ㄹ"],
      ["х", "ㅎ"],
      ["в", "ㅘ"],
      ["уе", "ㅝ"],
      ["уи", "ㅟ"],
      ["ыи", "ㅢ"],
      ["оа", "ㅘ"],
      ["ое", "ㅙ"],
      ["ои", "ㅚ"],
    ]),
  },
];

/** Latin-script national alphabets: RU → letters of that orthography. */
const LATIN_NATIONAL: Array<{
  id: string;
  symbols: string[];
  map: Array<[string, string]>;
  defaultOpen?: boolean;
}> = [
  {
    id: "turkish",
    defaultOpen: true,
    symbols: uniq([
      "a", "b", "c", "ç", "Ç", "d", "e", "f", "g", "ğ", "Ğ", "h", "ı", "I", "i", "İ",
      "j", "k", "l", "m", "n", "o", "ö", "Ö", "p", "r", "s", "ş", "Ş", "t", "u", "ü", "Ü",
      "v", "y", "z",
    ]),
    map: [
      ["а", "a"],
      ["б", "b"],
      ["в", "v"],
      ["г", "g"],
      ["д", "d"],
      ["е", "e"],
      ["ё", "ö"],
      ["ж", "j"],
      ["з", "z"],
      ["и", "i"],
      ["й", "y"],
      ["к", "k"],
      ["л", "l"],
      ["м", "m"],
      ["н", "n"],
      ["о", "o"],
      ["п", "p"],
      ["р", "r"],
      ["с", "s"],
      ["т", "t"],
      ["у", "u"],
      ["ф", "f"],
      ["х", "h"],
      ["ц", "c"],
      ["ч", "ç"],
      ["ш", "ş"],
      ["щ", "ş"],
      ["ы", "ı"],
      ["э", "e"],
      ["ю", "ü"],
      ["я", "ya"],
      ["гъ", "ğ"],
    ],
  },
  {
    id: "polish",
    symbols: uniq([
      "a", "A", "ą", "Ą", "b", "B", "c", "C", "ć", "Ć", "d", "D", "e", "E", "ę", "Ę", "f", "F",
      "g", "G", "h", "H", "i", "I", "j", "J", "k", "K", "l", "L", "ł", "Ł", "m", "M", "n", "N",
      "ń", "Ń", "o", "O", "ó", "Ó", "p", "P", "r", "R", "s", "S", "ś", "Ś", "t", "T",
      "u", "U", "w", "W", "y", "Y", "z", "Z", "ź", "Ź", "ż", "Ż",
    ]),
    map: [
      ["а", "a"],
      ["б", "b"],
      ["в", "w"],
      ["г", "g"],
      ["д", "d"],
      ["е", "e"],
      ["ё", "io"],
      ["ж", "ż"],
      ["з", "z"],
      ["и", "i"],
      ["й", "j"],
      ["к", "k"],
      ["л", "ł"],
      ["м", "m"],
      ["н", "n"],
      ["о", "o"],
      ["п", "p"],
      ["р", "r"],
      ["с", "s"],
      ["т", "t"],
      ["у", "u"],
      ["ф", "f"],
      ["х", "h"],
      ["ц", "c"],
      ["ч", "cz"],
      ["ш", "sz"],
      ["щ", "szcz"],
      ["ы", "y"],
      ["э", "e"],
      ["ю", "ju"],
      ["я", "ja"],
      ["нь", "ń"],
      ["ць", "ć"],
      ["сь", "ś"],
      ["зь", "ź"],
      ["он", "ą"],
      ["ен", "ę"],
      ["у́", "ó"],
    ],
  },
];

for (const pack of LATIN_NATIONAL) {
  ALPHABETS.push({
    id: pack.id,
    kind: "latin",
    defaultOpen: pack.defaultOpen,
    symbols: pack.symbols,
    layoutRules: withCase(pack.map),
  });
}

export function getAlphabet(id: string): AlphabetDef | undefined {
  return ALPHABETS.find((a) => a.id === id);
}

export function alphabetHasLayout(id: string): boolean {
  return Boolean(getAlphabet(id)?.layoutRules.length);
}

/** Fallback: treat symbols as targets with latin/cyr keys from RU_LATIN_BASE by index — unused; prefer explicit maps. */
export function buildIdentityRulesFromSymbols(symbols: string[]): LayoutRule[] {
  const letters = symbols.filter((s) => [...s].length === 1);
  return withCase(
    RU_LATIN_BASE.slice(0, Math.min(RU_LATIN_BASE.length, letters.length)).map(([from], i) => [
      from,
      letters[i],
    ]),
  );
}
