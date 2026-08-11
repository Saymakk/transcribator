import type { LocaleId, Messages } from "./en";
import { en, LOCALE_IDS, LOCALE_NATIVE_NAMES } from "./en";
import { ru } from "./ru";
import { uk } from "./uk";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";
import { pl } from "./pl";
import { zh } from "./zh";
import { ko } from "./ko";
import { ar } from "./ar";

export const catalogs: Record<LocaleId, Messages> = { en, ru, uk, de, fr, es, pl, zh, ko, ar };

export function normalizeLocale(raw: string | undefined | null): LocaleId {
  if (!raw) return "ru";
  const base = raw.toLowerCase().replace("_", "-").split("-")[0];
  if ((LOCALE_IDS as string[]).includes(base)) return base as LocaleId;
  return "ru";
}

export function getMessages(locale: LocaleId): Messages {
  return catalogs[locale] ?? en;
}

export function t(
  messages: Messages,
  path: string,
  vars?: Record<string, string | number>,
): string {
  const [section, key] = path.split(".");
  const sectionObj = (messages as Record<string, Record<string, string>>)[section];
  let text = sectionObj?.[key] ?? (en as Record<string, Record<string, string>>)[section]?.[key] ?? path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export type { LocaleId, Messages };
export { en, LOCALE_IDS, LOCALE_NATIVE_NAMES };
