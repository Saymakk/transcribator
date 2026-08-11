import type { PuntoDictEntry } from "../types";
import index from "./index.json";

export type DictPackMeta = {
  id: string;
  name: string;
  language: string;
  count: number;
};

export const UN_DICT_PACKS: DictPackMeta[] = index as DictPackMeta[];

const packModules: Record<string, () => Promise<{ default: { entries: PuntoDictEntry[] } }>> = {
  ru: () => import("./ru.json"),
  en: () => import("./en.json"),
  fr: () => import("./fr.json"),
  es: () => import("./es.json"),
  ar: () => import("./ar.json"),
  zh: () => import("./zh.json"),
};

const cache = new Map<string, PuntoDictEntry[]>();

export async function loadDictPack(id: string): Promise<PuntoDictEntry[]> {
  if (cache.has(id)) return cache.get(id)!;
  const loader = packModules[id];
  if (!loader) return [];
  const mod = await loader();
  const entries = (mod as { default: { entries: PuntoDictEntry[] } }).default.entries;
  cache.set(id, entries);
  return entries;
}

export async function loadDictPacks(ids: string[]): Promise<PuntoDictEntry[]> {
  const maps = new Map<string, PuntoDictEntry>();
  for (const id of ids) {
    const entries = await loadDictPack(id);
    for (const e of entries) {
      const key = e.from.toLocaleLowerCase("en-US");
      if (!maps.has(key)) maps.set(key, e);
    }
  }
  return [...maps.values()];
}

export function mergeDictionaries(
  packs: PuntoDictEntry[],
  custom: PuntoDictEntry[],
): PuntoDictEntry[] {
  const map = new Map<string, PuntoDictEntry>();
  for (const e of packs) {
    const key = e.from.trim().toLocaleLowerCase("en-US");
    if (!key) continue;
    map.set(key, e);
  }
  // Пользовательский словарь перекрывает пакеты
  for (const e of custom) {
    const key = e.from.trim().toLocaleLowerCase("en-US");
    if (!key) continue;
    map.set(key, { from: e.from.trim(), to: e.to });
  }
  return [...map.values()];
}
