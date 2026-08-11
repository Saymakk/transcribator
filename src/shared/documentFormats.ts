/** Расширения, которые конвертер умеет читать (без точки). */
export const DOCUMENT_EXTENSIONS = [
  // Текст / код / разметка
  "txt",
  "text",
  "md",
  "markdown",
  "mdown",
  "rst",
  "adoc",
  "asciidoc",
  "tex",
  "ltx",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "ndjson",
  "xml",
  "xsl",
  "xslt",
  "svg",
  "html",
  "htm",
  "xhtml",
  "mhtml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "properties",
  "env",
  "log",
  "sql",
  "diff",
  "patch",
  "srt",
  "vtt",
  "ass",
  "ssa",
  "lrc",
  "org",
  "textile",
  "wiki",
  "nfo",
  "diz",
  "asc",
  "lst",
  "out",
  "err",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "bash",
  "zsh",
  "fish",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "cs",
  "java",
  "kt",
  "kts",
  "go",
  "rs",
  "py",
  "rb",
  "php",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "vue",
  "svelte",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "swift",
  "m",
  "mm",
  "r",
  "pl",
  "pm",
  "lua",
  "scala",
  "clj",
  "ex",
  "exs",
  "erl",
  "hs",
  "fs",
  "fsx",
  "dart",
  "groovy",
  "gradle",
  "cmake",
  "makefile",
  "mk",
  "dockerfile",
  "gitignore",
  "gitattributes",
  "editorconfig",
  "npmrc",
  "nvmrc",
  "lock",
  "pem",
  "crt",
  "key",
  "pub",
  // Документы
  "pdf",
  "docx",
  "doc",
  "dotx",
  "odt",
  "ott",
  "rtf",
  "fb2",
  "epub",
  // Таблицы
  "xlsx",
  "xlsm",
  "xls",
  "xlsb",
  "ods",
  "fods",
  "numbers",
  // Презентации
  "pptx",
  "pptm",
  "odp",
  "fodp",
] as const;

export type DocumentExtension = (typeof DOCUMENT_EXTENSIONS)[number];

export const OPEN_DIALOG_FILTERS: { name: string; extensions: string[] }[] = [
  {
    name: "Документы",
    extensions: ["pdf", "docx", "doc", "odt", "rtf", "fb2", "epub"],
  },
  {
    name: "Таблицы",
    extensions: ["xlsx", "xlsm", "xls", "xlsb", "ods", "csv", "tsv"],
  },
  {
    name: "Презентации",
    extensions: ["pptx", "pptm", "odp"],
  },
  {
    name: "Текст и разметка",
    extensions: [
      "txt",
      "md",
      "html",
      "htm",
      "xml",
      "json",
      "yaml",
      "yml",
      "log",
      "srt",
      "vtt",
    ],
  },
  {
    name: "Все поддерживаемые",
    extensions: [...DOCUMENT_EXTENSIONS],
  },
  { name: "Все файлы", extensions: ["*"] },
];

export function extOf(fileName: string): string {
  const base = fileName.includes("/") || fileName.includes("\\")
    ? fileName.replace(/^.*[/\\]/, "")
    : fileName;
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

export function isSupportedDocument(fileName: string): boolean {
  const ext = extOf(fileName);
  if (!ext) return false;
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

export function formatSupportHint(): string {
  return (
    "PDF, Word (.doc/.docx), ODT, RTF, EPUB, FB2, Excel (.xls/.xlsx), ODS, " +
    "PowerPoint (.pptx), ODP, HTML, XML, Markdown, CSV/TSV, JSON, YAML, " +
    "субтитры, код и обычный текст"
  );
}
