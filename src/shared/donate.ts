/** Ссылки поддержки проекта. */
export const DONATE_LINKS = [
  {
    id: "liberapay",
    labelKey: "donate.liberapay",
    url: "https://liberapay.com/Saymakk/donate",
  },
  {
    id: "kofi",
    labelKey: "donate.kofi",
    url: "https://ko-fi.com/saymakk",
  },
] as const;

export type DonateLinkId = (typeof DONATE_LINKS)[number]["id"];
