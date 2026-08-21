/** Video containers that commonly embed subtitle streams. */
export const VIDEO_EXTENSIONS = [
  "mkv",
  "mp4",
  "m4v",
  "webm",
  "avi",
  "mov",
  "wmv",
  "ts",
  "m2ts",
  "mts",
  "flv",
  "mpg",
  "mpeg",
] as const;

export function isVideoFileName(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function videoSupportHint(): string {
  return VIDEO_EXTENSIONS.map((e) => `.${e}`).join(", ");
}
