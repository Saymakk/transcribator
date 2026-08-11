import path from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import jschardet from "jschardet";
import WordExtractor from "word-extractor";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extOf } from "../src/shared/documentFormats";
import { getMessages, t } from "../src/shared/i18n";
import type { LocaleId } from "../src/shared/i18n";

// Locale for extract errors — set from main when possible; defaults to ru.
let extractLocale: LocaleId = "ru";

export function setExtractLocale(locale: LocaleId): void {
  extractLocale = locale;
}

function em(path: string, vars?: Record<string, string | number>): string {
  return t(getMessages(extractLocale), path, vars);
}

const TEXT_LIKE = new Set([
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
  "fods",
  "fodp",
]);

const HTML_LIKE = new Set(["html", "htm", "xhtml", "mhtml"]);
const SPREADSHEET = new Set(["xlsx", "xlsm", "xls", "xlsb", "ods", "numbers"]);
const WORD_XML = new Set(["docx", "dotx"]);
const OPEN_DOC = new Set(["odt", "ott"]);
const OPEN_PRES = new Set(["odp"]);
const PPTX_LIKE = new Set(["pptx", "pptm"]);

function decodeTextBuffer(buf: Buffer): string {
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.alloc(buf.length - 2);
      for (let i = 2; i + 1 < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1];
        swapped[i - 1] = buf[i];
      }
      return swapped.toString("utf16le");
    }
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }

  const sample = buf.subarray(0, Math.min(buf.length, 256 * 1024));
  const detected = jschardet.detect(sample);
  const encoding = (detected?.encoding || "UTF-8").toLowerCase();
  const conf = detected?.confidence ?? 0;

  const map: Record<string, BufferEncoding | "win1251" | "koi8-r" | "latin1"> = {
    "utf-8": "utf8",
    utf8: "utf8",
    ascii: "utf8",
    "windows-1251": "win1251",
    "windows-1252": "latin1",
    "iso-8859-1": "latin1",
    "iso-8859-5": "latin1",
    "koi8-r": "koi8-r",
    "ibm866": "latin1",
    "utf-16le": "utf16le",
    "utf-16be": "utf16le",
  };

  if (conf >= 0.6 && encoding in map) {
    const enc = map[encoding];
    if (enc === "win1251" || enc === "koi8-r") {
      try {
        return new TextDecoder(enc === "win1251" ? "windows-1251" : "koi8-r").decode(buf);
      } catch {
        /* fall through */
      }
    } else if (enc === "latin1") {
      try {
        return new TextDecoder(
          encoding === "windows-1252" ? "windows-1252" : "iso-8859-1",
        ).decode(buf);
      } catch {
        return buf.toString("latin1");
      }
    } else {
      return buf.toString(enc);
    }
  }

  const asUtf8 = buf.toString("utf8");
  if (!asUtf8.includes("\uFFFD")) return asUtf8;
  try {
    return new TextDecoder("windows-1251").decode(buf);
  } catch {
    return asUtf8;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripRtf(rtf: string): string {
  let s = rtf.replace(/\r\n?/g, "\n");
  s = s.replace(/\{\\pict[\s\S]*?\}/g, " ");
  s = s.replace(/\{\\fonttbl[\s\S]*?\}/g, " ");
  s = s.replace(/\{\\colortbl[\s\S]*?\}/g, " ");
  s = s.replace(/\{\\stylesheet[\s\S]*?\}/g, " ");
  s = s.replace(/\{\\info[\s\S]*?\}/g, " ");
  s = s.replace(/\\'[0-9a-fA-F]{2}/g, (m) => {
    try {
      return Buffer.from(m.slice(2), "hex").toString("latin1");
    } catch {
      return " ";
    }
  });
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => {
    let code = Number(n);
    if (code < 0) code += 65536;
    try {
      return String.fromCharCode(code);
    } catch {
      return " ";
    }
  });
  s = s.replace(/\\par[d]?/g, "\n");
  s = s.replace(/\\line/g, "\n");
  s = s.replace(/\\tab/g, "\t");
  s = s.replace(/\\[a-z]+(-?\d+)?[ ]?/gi, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\\\\/g, "\\");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function xmlTextContent(xml: string): string {
  return stripHtml(xml.replace(/<\?xml[\s\S]*?\?>/i, ""));
}

async function extractPdf(buf: Buffer): Promise<string> {
  const data = new Uint8Array(buf);
  const doc = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
  }).promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .join(" ");
    parts.push(line);
  }
  await doc.destroy();
  return parts.join("\n\n").trim();
}

async function extractDocx(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf });
  return (result.value || "").trim();
}

async function extractDoc(buf: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buf);
  const body = doc.getBody() || "";
  const headers = doc.getHeaders({ includeFooters: true }) || "";
  return [body, headers].filter(Boolean).join("\n\n").trim();
}

async function extractOdt(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const content = await zip.file("content.xml")?.async("string");
  if (!content) throw new Error(em("errors.odtMissing"));
  return xmlTextContent(content);
}

async function extractSpreadsheet(buf: Buffer): Promise<string> {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    parts.push(`## ${name}`);
    parts.push(XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" }));
  }
  return parts.join("\n\n").trim();
}

async function extractPptx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
      return na - nb;
    });
  const parts: string[] = [];
  for (const file of slideFiles) {
    const xml = await zip.file(file)!.async("string");
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
    );
    if (texts.length) parts.push(texts.join(" "));
  }
  return parts.join("\n\n").trim();
}

async function extractOdp(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const content = await zip.file("content.xml")?.async("string");
  if (!content) throw new Error(em("errors.odpMissing"));
  return xmlTextContent(content);
}

async function extractEpub(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const htmlFiles = Object.keys(zip.files)
    .filter((f) => /\.(xhtml|html|htm|xml)$/i.test(f) && !f.endsWith("/"))
    .filter((f) => !/meta-inf/i.test(f))
    .sort();
  const parts: string[] = [];
  for (const file of htmlFiles) {
    const html = await zip.file(file)!.async("string");
    const text = stripHtml(html);
    if (text) parts.push(text);
  }
  return parts.join("\n\n").trim();
}

function extractFb2(buf: Buffer): string {
  const xml = decodeTextBuffer(buf);
  const bodies = [...xml.matchAll(/<body[\s\S]*?>([\s\S]*?)<\/body>/gi)].map((m) => m[1]);
  const chunk = bodies.length ? bodies.join("\n") : xml;
  return xmlTextContent(chunk);
}

/**
 * Извлекает текст из буфера файла по расширению имени.
 */
export async function extractDocumentText(
  fileName: string,
  data: Buffer | Uint8Array | ArrayBuffer,
): Promise<string> {
  const buf = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  const ext = extOf(fileName) || extOf(path.basename(fileName));

  if (!ext) {
    return decodeTextBuffer(buf);
  }

  if (ext === "pdf") return extractPdf(buf);
  if (WORD_XML.has(ext)) return extractDocx(buf);
  if (ext === "doc") return extractDoc(buf);
  if (OPEN_DOC.has(ext)) return extractOdt(buf);
  if (ext === "rtf") return stripRtf(decodeTextBuffer(buf));
  if (ext === "fb2") return extractFb2(buf);
  if (ext === "epub") return extractEpub(buf);
  if (SPREADSHEET.has(ext)) return extractSpreadsheet(buf);
  if (PPTX_LIKE.has(ext)) return extractPptx(buf);
  if (OPEN_PRES.has(ext)) return extractOdp(buf);
  if (HTML_LIKE.has(ext)) return stripHtml(decodeTextBuffer(buf));
  if (TEXT_LIKE.has(ext) || ext === "csv" || ext === "tsv") {
    return decodeTextBuffer(buf);
  }

  // Неизвестное расширение: пробуем как текст, затем как zip/office
  const asText = decodeTextBuffer(buf);
  if (!asText.includes("\uFFFD") && /[\p{L}\p{N}]/u.test(asText.slice(0, 2000))) {
    return asText;
  }

  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    try {
      return await extractDocx(buf);
    } catch {
      /* ignore */
    }
    try {
      return await extractOdt(buf);
    } catch {
      /* ignore */
    }
    try {
      return await extractPptx(buf);
    } catch {
      /* ignore */
    }
    try {
      return await extractEpub(buf);
    } catch {
      /* ignore */
    }
  }

  if (buf.slice(0, 5).toString("utf8") === "%PDF-") {
    return extractPdf(buf);
  }

  throw new Error(em("errors.extractFailed", { ext }));
}
