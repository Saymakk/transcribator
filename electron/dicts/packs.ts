import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { PuntoDictEntry } from "../shared/types";

type PackFile = {
  id: string;
  entries: PuntoDictEntry[];
};

const packCache = new Map<string, PuntoDictEntry[]>();
let mergedCacheKey = "";
let mergedCache: PuntoDictEntry[] = [];

function packsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "data");
  }
  return path.join(process.cwd(), "electron", "data");
}

export function loadPackEntries(id: string): PuntoDictEntry[] {
  if (packCache.has(id)) return packCache.get(id)!;
  try {
    const file = path.join(packsDir(), `${id}.json`);
    if (!fs.existsSync(file)) {
      packCache.set(id, []);
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as PackFile;
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    packCache.set(id, entries);
    return entries;
  } catch (error) {
    console.error("Failed to load dict pack", id, error);
    packCache.set(id, []);
    return [];
  }
}

export function mergePacksAndCustom(
  packIds: string[],
  custom: PuntoDictEntry[],
): PuntoDictEntry[] {
  const key = `${packIds.join(",")}|${custom.length}|${custom
    .map((e) => `${e.from}>${e.to}`)
    .join(";")}`;
  if (key === mergedCacheKey) return mergedCache;

  const map = new Map<string, PuntoDictEntry>();
  for (const id of packIds) {
    for (const e of loadPackEntries(id)) {
      const k = e.from.trim().toLocaleLowerCase("en-US");
      if (!k) continue;
      if (!map.has(k)) map.set(k, e);
    }
  }
  for (const e of custom) {
    const k = e.from.trim().toLocaleLowerCase("en-US");
    if (!k) continue;
    map.set(k, { from: e.from.trim(), to: e.to });
  }
  mergedCache = [...map.values()];
  mergedCacheKey = key;
  return mergedCache;
}

export const DEFAULT_UN_PACK_IDS = ["ru", "en", "fr", "es", "ar", "zh"];
