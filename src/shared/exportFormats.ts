/** Расширения, в которые умеем сохранять результат конвертера. */
export const EXPORT_EXTENSIONS = [
  // Текст
  "txt",
  "text",
  "log",
  "nfo",
  "lst",
  "out",
  // Разметка
  "md",
  "markdown",
  "mdown",
  "rst",
  "adoc",
  "asciidoc",
  "textile",
  "wiki",
  "org",
  "html",
  "htm",
  "xhtml",
  "xml",
  "svg",
  // Данные
  "json",
  "jsonl",
  "ndjson",
  "yaml",
  "yml",
  "toml",
  "csv",
  "tsv",
  "ini",
  "cfg",
  "conf",
  "properties",
  "env",
  "sql",
  "diff",
  "patch",
  // Документы
  "rtf",
  "docx",
  "odt",
  "fb2",
  // Таблицы
  "xlsx",
  "xls",
  "ods",
  "fods",
  "sylk",
  "slk",
  "dif",
  // Субтитры
  "srt",
  "vtt",
  "ass",
  "ssa",
  "lrc",
  // TeX / код (как текст)
  "tex",
  "ltx",
  "c",
  "h",
  "cpp",
  "cs",
  "java",
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "go",
  "rs",
  "rb",
  "php",
  "css",
  "scss",
  "sh",
  "ps1",
  "bat",
  "cmd",
] as const;

export type ExportExtension = (typeof EXPORT_EXTENSIONS)[number];

export type ExportFilterId =
  | "allExport"
  | "txt"
  | "md"
  | "html"
  | "rtf"
  | "docx"
  | "odt"
  | "fb2"
  | "xlsx"
  | "ods"
  | "csv"
  | "tsv"
  | "json"
  | "xml"
  | "yaml"
  | "subs"
  | "tex"
  | "code"
  | "all";

export type ExportFilterDef = {
  id: ExportFilterId;
  /** i18n key under files.* */
  labelKey: string;
  extensions: string[];
};

/** Группы для диалога «Сохранить как» — расширение выбирается в фильтре. */
export const EXPORT_FILTER_DEFS: ExportFilterDef[] = [
  {
    id: "allExport",
    labelKey: "filterAllExport",
    extensions: [...new Set(EXPORT_EXTENSIONS)],
  },
  { id: "txt", labelKey: "filterTxt", extensions: ["txt", "text", "log", "nfo", "lst"] },
  { id: "md", labelKey: "filterMd", extensions: ["md", "markdown", "mdown", "rst", "adoc"] },
  { id: "html", labelKey: "filterHtml", extensions: ["html", "htm", "xhtml"] },
  { id: "rtf", labelKey: "filterRtf", extensions: ["rtf"] },
  { id: "docx", labelKey: "filterDocx", extensions: ["docx"] },
  { id: "odt", labelKey: "filterOdt", extensions: ["odt"] },
  { id: "fb2", labelKey: "filterFb2", extensions: ["fb2"] },
  { id: "xlsx", labelKey: "filterXlsx", extensions: ["xlsx", "xls"] },
  { id: "ods", labelKey: "filterOds", extensions: ["ods", "fods"] },
  { id: "csv", labelKey: "filterCsv", extensions: ["csv"] },
  { id: "tsv", labelKey: "filterTsv", extensions: ["tsv"] },
  { id: "json", labelKey: "filterJson", extensions: ["json", "jsonl", "ndjson"] },
  { id: "xml", labelKey: "filterXml", extensions: ["xml", "svg"] },
  { id: "yaml", labelKey: "filterYaml", extensions: ["yaml", "yml", "toml"] },
  {
    id: "subs",
    labelKey: "filterSubs",
    extensions: ["srt", "vtt", "ass", "ssa", "lrc"],
  },
  { id: "tex", labelKey: "filterTex", extensions: ["tex", "ltx"] },
  {
    id: "code",
    labelKey: "filterCode",
    extensions: [
      "c",
      "h",
      "cpp",
      "cs",
      "java",
      "py",
      "js",
      "ts",
      "tsx",
      "go",
      "rs",
      "rb",
      "php",
      "css",
      "sh",
      "ps1",
      "bat",
      "sql",
      "ini",
      "cfg",
      "diff",
    ],
  },
  { id: "all", labelKey: "filterAll", extensions: ["*"] },
];

export function extOfPath(filePath: string): string {
  const base = filePath.replace(/^.*[/\\]/, "");
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

export function ensureExportExtension(filePath: string, fallbackExt: string): string {
  const ext = extOfPath(filePath);
  if (ext) return filePath;
  const clean = fallbackExt.replace(/^\./, "") || "txt";
  return `${filePath}.${clean}`;
}
