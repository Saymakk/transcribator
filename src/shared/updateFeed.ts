export type UpdateProviderId = "github" | "generic";

export type UpdatePrefs = {
  /** github = GitHub Releases (default). generic = HTTP folder or Yandex Disk. */
  provider: UpdateProviderId;
  /** Public folder URL (Yandex Disk / HTTPS directory with latest.yml). Ignored for github. */
  url: string;
};

export const GITHUB_RELEASES = {
  owner: "Saymakk",
  repo: "transcribator",
} as const;

export function githubLatestDownloadUrl(): string {
  return `https://github.com/${GITHUB_RELEASES.owner}/${GITHUB_RELEASES.repo}/releases/latest/download`;
}

export function githubTagDownloadUrl(tag: string): string {
  const safe = tag.replace(/^\/+|\/+$/g, "");
  return `https://github.com/${GITHUB_RELEASES.owner}/${GITHUB_RELEASES.repo}/releases/download/${safe}`;
}

export const DEFAULT_UPDATE_PREFS: UpdatePrefs = {
  provider: "github",
  url: "",
};

export function migrateUpdatePrefs(raw: unknown): UpdatePrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_UPDATE_PREFS };
  const o = raw as Record<string, unknown>;
  const provider: UpdateProviderId = o.provider === "generic" ? "generic" : "github";
  const url = typeof o.url === "string" ? o.url.trim() : "";
  return { provider, url };
}

export type UpdateFeedKind = "github" | "generic-http" | "yandex" | "google-drive";

export function classifyUpdateFeed(prefs: UpdatePrefs): UpdateFeedKind {
  if (prefs.provider !== "generic" || !prefs.url.trim()) return "github";
  const url = prefs.url.trim();
  if (/disk\.yandex\.(ru|com)|yadi\.sk|yandex\.\w+\/.*\/d\//i.test(url)) return "yandex";
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) return "google-drive";
  return "generic-http";
}

export function normalizeHttpFeedUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function parseLatestYml(text: string): {
  version: string;
  path: string;
  sha512?: string;
  size?: number;
} {
  const version = text.match(/^version:\s*['"]?([^\s'"]+)/m)?.[1];
  const filePath =
    text.match(/^path:\s*['"]?(.+?)['"]?\s*$/m)?.[1]?.trim() ||
    text.match(/^\s+-\s+url:\s*['"]?(.+?)['"]?\s*$/m)?.[1]?.trim();
  const sha512 = text.match(/^sha512:\s*['"]?([^\s'"]+)/m)?.[1];
  const sizeRaw = text.match(/^\s+size:\s*(\d+)/m)?.[1];
  if (!version || !filePath) {
    throw new Error("latest.yml is missing version or path");
  }
  return {
    version,
    path: filePath,
    sha512,
    size: sizeRaw ? Number(sizeRaw) : undefined,
  };
}

/** semver-ish: 1.2.3 > 1.2.2 */
export function isRemoteNewer(remote: string, local: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((p) => {
        const n = Number.parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const a = parse(remote);
  const b = parse(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}
