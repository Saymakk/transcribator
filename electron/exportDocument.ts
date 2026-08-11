/**
 * Кодирование текста результата в выбранный формат файла.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { extOfPath } from "../src/shared/exportFormats";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function linesOf(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function wrapHtml(text: string): string {
  const body = escapeXml(text).replace(/\n/g, "<br/>\n");
  return `<!DOCTYPE html>
<html lang="und">
<head>
<meta charset="utf-8"/>
<title>Transcribator</title>
</head>
<body>
<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif">${body}</pre>
</body>
</html>
`;
}

function wrapXhtml(text: string): string {
  const body = escapeXml(text).replace(/\n/g, "<br/>\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="und">
<head><title>Transcribator</title><meta charset="utf-8"/></head>
<body><pre>${body}</pre></body>
</html>
`;
}

function wrapXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
${linesOf(text)
  .map((line, i) => `  <line n="${i + 1}">${escapeXml(line)}</line>`)
  .join("\n")}
</document>
`;
}

function wrapFb2(text: string): string {
  const paras = linesOf(text)
    .map((line) => `    <p>${escapeXml(line || "\u00a0")}</p>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>nonfiction</genre>
      <book-title>Transcribator</book-title>
      <lang>und</lang>
    </title-info>
  </description>
  <body>
    <section>
${paras}
    </section>
  </body>
</FictionBook>
`;
}

/** RTF с Unicode-эскейпами (\uN?) — корректно для кириллицы и др. */
function wrapRtf(text: string): string {
  let body = "";
  for (const ch of text) {
    if (ch === "\\") body += "\\\\";
    else if (ch === "{") body += "\\{";
    else if (ch === "}") body += "\\}";
    else if (ch === "\n") body += "\\par\n";
    else if (ch === "\r") continue;
    else if (ch === "\t") body += "\\tab ";
    else {
      const code = ch.codePointAt(0)!;
      if (code < 128) body += ch;
      else {
        // RTF \\u is signed 16-bit
        const signed = code > 32767 ? code - 65536 : code;
        body += `\\u${signed}?`;
      }
    }
  }
  return `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0
{\\fonttbl{\\f0\\fnil\\fcharset0 Segoe UI;}}
\\f0\\fs24
${body}
}`;
}

function toCsv(text: string, sep: "," | "\t"): string {
  return linesOf(text)
    .map((line) => {
      if (sep === "\t") {
        return line.replace(/\t/g, " ").replace(/\r?\n/g, " ");
      }
      if (/[",\n\r]/.test(line)) return `"${line.replace(/"/g, '""')}"`;
      return line;
    })
    .join("\n");
}

function toJson(text: string): string {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
    } catch {
      /* wrap */
    }
  }
  return `${JSON.stringify({ text }, null, 2)}\n`;
}

function toJsonl(text: string): string {
  return `${linesOf(text)
    .map((line) => JSON.stringify({ text: line }))
    .join("\n")}\n`;
}

function toYaml(text: string): string {
  const indented = linesOf(text)
    .map((l) => `  ${l}`)
    .join("\n");
  return `text: |\n${indented}\n`;
}

function toToml(text: string): string {
  const escaped = text.replace(/\\/g, "\\\\").replace(/"""/g, '\\"""');
  return `text = """\n${escaped}\n"""\n`;
}

function wrapTex(text: string): string {
  const body = text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}$&#^_~%])/g, "\\$1")
    .replace(/\n/g, "\\\\\n");
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T2A]{fontenc}
\\begin{document}
${body}
\\end{document}
`;
}

function looksLikeSrt(text: string): boolean {
  return /^\s*\d+\s*\r?\n\d{2}:\d{2}:\d{2}/m.test(text);
}

function wrapVtt(text: string): string {
  if (/^\s*WEBVTT/i.test(text)) return text.endsWith("\n") ? text : `${text}\n`;
  if (looksLikeSrt(text)) {
    // грубо: оставить как есть + заголовок
    return `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d+)/g, "$1.$2")}\n`;
  }
  const lines = linesOf(text).filter((l) => l.length > 0);
  if (lines.length === 0) return "WEBVTT\n";
  return `WEBVTT\n\n00:00:00.000 --> 00:00:10.000\n${lines.join("\n")}\n`;
}

function wrapAss(text: string): string {
  if (/\[Script Info\]/i.test(text) || /Dialogue:/i.test(text)) {
    return text.endsWith("\n") ? text : `${text}\n`;
  }
  const body = linesOf(text)
    .filter((l) => l.length > 0)
    .map((l) => `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${l.replace(/\n/g, "\\N")}`)
    .join("\n");
  return `[Script Info]
Title: Transcribator
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${body}
`;
}

function xmlEscapeDocx(text: string): string {
  return escapeXml(text).replace(/\t/g, "</w:t><w:tab/><w:t>");
}

async function buildDocx(text: string): Promise<Buffer> {
  const paragraphs = linesOf(text)
    .map((line) => {
      if (!line) {
        return `<w:p><w:pPr/><w:r><w:t></w:t></w:r></w:p>`;
      }
      return `<w:p><w:r><w:t xml:space="preserve">${xmlEscapeDocx(line)}</w:t></w:r></w:p>`;
    })
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const word = zip.folder("word")!;
  word.file("document.xml", documentXml);
  word.folder("_rels")!.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(buf);
}

async function buildOdt(text: string): Promise<Buffer> {
  const paras = linesOf(text)
    .map((line) => {
      if (!line) return `<text:p text:style-name="Standard"/>`;
      return `<text:p text:style-name="Standard">${escapeXml(line)}</text:p>`;
    })
    .join("\n");

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:body>
    <office:text>
${paras}
    </office:text>
  </office:body>
</office:document-content>`;

  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", {
    compression: "STORE",
  });
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`,
  );
  zip.file("content.xml", content);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(buf);
}

function sheetBookType(
  ext: string,
): XLSX.BookType | null {
  switch (ext) {
    case "xlsx":
      return "xlsx";
    case "xls":
      return "xls";
    case "ods":
      return "ods";
    case "fods":
      return "fods";
    case "sylk":
    case "slk":
      return "sylk";
    case "dif":
      return "dif";
    case "csv":
      return "csv";
    case "tsv":
      return "txt";
    default:
      return null;
  }
}

function buildSheet(text: string, bookType: XLSX.BookType): Buffer {
  const aoa = linesOf(text).map((line) => [line]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const raw = XLSX.write(wb, {
    type: "buffer",
    bookType,
  }) as Buffer | Uint8Array | string;
  if (typeof raw === "string") return Buffer.from(raw, "utf8");
  return Buffer.from(raw);
}

/**
 * Превращает текст результата в байты файла выбранного типа.
 */
export async function encodeExportContent(
  content: string,
  filePathOrExt: string,
): Promise<Buffer> {
  const ext =
    filePathOrExt.includes(".") || filePathOrExt.includes("/") || filePathOrExt.includes("\\")
      ? extOfPath(filePathOrExt)
      : filePathOrExt.toLowerCase().replace(/^\./, "");

  const sheet = sheetBookType(ext);
  if (sheet && ["xlsx", "xls", "ods", "fods", "sylk", "slk", "dif"].includes(ext)) {
    return buildSheet(content, sheet);
  }

  switch (ext) {
    case "html":
    case "htm":
      return Buffer.from(wrapHtml(content), "utf8");
    case "xhtml":
      return Buffer.from(wrapXhtml(content), "utf8");
    case "xml":
    case "svg":
      return Buffer.from(wrapXml(content), "utf8");
    case "fb2":
      return Buffer.from(wrapFb2(content), "utf8");
    case "rtf":
      return Buffer.from(wrapRtf(content), "utf8");
    case "docx":
      return buildDocx(content);
    case "odt":
      return buildOdt(content);
    case "csv":
      return Buffer.from(toCsv(content, ","), "utf8");
    case "tsv":
      return Buffer.from(toCsv(content, "\t"), "utf8");
    case "json":
      return Buffer.from(toJson(content), "utf8");
    case "jsonl":
    case "ndjson":
      return Buffer.from(toJsonl(content), "utf8");
    case "yaml":
    case "yml":
      return Buffer.from(toYaml(content), "utf8");
    case "toml":
      return Buffer.from(toToml(content), "utf8");
    case "tex":
    case "ltx":
      return Buffer.from(wrapTex(content), "utf8");
    case "vtt":
      return Buffer.from(wrapVtt(content), "utf8");
    case "ass":
    case "ssa":
      return Buffer.from(wrapAss(content), "utf8");
    case "srt":
    case "lrc":
      // SRT из ASS уже готов; иначе пишем как есть
      return Buffer.from(content.endsWith("\n") ? content : `${content}\n`, "utf8");
    default:
      // txt, md, code, logs, …
      return Buffer.from(content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }
}
