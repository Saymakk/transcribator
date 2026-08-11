import type { Layout, LayoutRule, RuleConflict } from "./types";

function normalizeRules(rules: LayoutRule[]): LayoutRule[] {
  return rules
    .map((r) => ({
      from: r.from.trim(),
      to: r.to,
    }))
    .filter((r) => r.from.length > 0);
}

function applyCase(sourceChunk: string, mapped: string): string {
  if (!mapped) return mapped;
  if (sourceChunk === sourceChunk.toUpperCase() && sourceChunk !== sourceChunk.toLowerCase()) {
    return mapped.toLocaleUpperCase("ru-RU");
  }
  if (
    sourceChunk[0] === sourceChunk[0].toLocaleUpperCase("ru-RU") &&
    sourceChunk !== sourceChunk.toLocaleLowerCase("ru-RU")
  ) {
    return mapped.charAt(0).toLocaleUpperCase("ru-RU") + mapped.slice(1);
  }
  return mapped;
}

function buildForwardMap(rules: LayoutRule[]): Map<string, string> {
  const map = new Map<string, string>();
  const sorted = normalizeRules(rules).sort((a, b) => b.from.length - a.from.length);
  for (const rule of sorted) {
    const key = rule.from.toLocaleLowerCase("ru-RU");
    if (!map.has(key)) map.set(key, rule.to);
  }
  return map;
}

export function buildReverseMap(rules: LayoutRule[]): Map<string, string> {
  const ranked = normalizeRules(rules)
    .slice()
    .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from, "ru"));

  const map = new Map<string, string>();
  for (const rule of ranked) {
    if (!rule.to) continue;
    if (!map.has(rule.to)) {
      map.set(rule.to, rule.from.toLocaleLowerCase("ru-RU"));
    }
    const lowerTo = rule.to.toLocaleLowerCase("en-US");
    if (lowerTo !== rule.to && !map.has(lowerTo)) {
      map.set(lowerTo, rule.from.toLocaleLowerCase("ru-RU"));
    }
  }
  return map;
}

export function findReverseConflicts(rules: LayoutRule[]): RuleConflict[] {
  const byTo = new Map<string, Set<string>>();
  for (const rule of normalizeRules(rules)) {
    if (!rule.to) continue;
    const set = byTo.get(rule.to) ?? new Set<string>();
    set.add(rule.from.toLocaleLowerCase("ru-RU"));
    byTo.set(rule.to, set);
  }
  const conflicts: RuleConflict[] = [];
  for (const [symbol, fromOptions] of byTo) {
    if (fromOptions.size > 1) {
      conflicts.push({
        symbol,
        fromOptions: [...fromOptions].sort((a, b) => b.length - a.length || a.localeCompare(b, "ru")),
      });
    }
  }
  return conflicts.sort((a, b) => a.symbol.localeCompare(b.symbol, "ru"));
}

function transliterateWithMap(input: string, map: Map<string, string>): string {
  if (!input) return input;

  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  let i = 0;
  let out = "";

  while (i < input.length) {
    let matched = false;
    for (const key of keys) {
      const slice = input.slice(i, i + key.length);
      if (
        slice === key ||
        slice.toLocaleLowerCase("ru-RU") === key ||
        slice.toLocaleLowerCase("en-US") === key
      ) {
        out += applyCase(slice, map.get(key) ?? "");
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += input[i];
      i += 1;
    }
  }

  return out;
}

export function transliterateForward(text: string, layout: Layout): string {
  return transliterateWithMap(text, buildForwardMap(layout.rules));
}

export function transliterateReverse(text: string, layout: Layout): string {
  return transliterateWithMap(text, buildReverseMap(layout.rules));
}

export function transliterateWord(
  word: string,
  layout: Layout,
  direction: "forward" | "reverse",
): string {
  return direction === "forward"
    ? transliterateForward(word, layout)
    : transliterateReverse(word, layout);
}
