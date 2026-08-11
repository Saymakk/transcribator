import fs from "node:fs";
import path from "node:path";
import { extractDocumentText } from "../electron/documentExtract";

async function main() {
  const tmp = path.join(process.cwd(), ".tmp-extract-test");
  fs.mkdirSync(tmp, { recursive: true });

  const samples: { name: string; data: Buffer }[] = [
    { name: "a.txt", data: Buffer.from("Привет, мир!", "utf8") },
    { name: "b.html", data: Buffer.from("<p>Hello <b>world</b></p>", "utf8") },
    { name: "c.rtf", data: Buffer.from("{\\rtf1\\ansi Hello\\par world}", "utf8") },
    {
      name: "d.csv",
      data: Buffer.from("имя,город\nИван,Москва\n", "utf8"),
    },
    {
      name: "e.fb2",
      data: Buffer.from(
        '<?xml version="1.0"?><FictionBook><body><p>Книга тест</p></body></FictionBook>',
        "utf8",
      ),
    },
  ];

  for (const s of samples) {
    const text = await extractDocumentText(s.name, s.data);
    console.log(`OK ${s.name}:`, JSON.stringify(text.slice(0, 80)));
  }

  // xlsx via sheetjs write
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["A", "B"],
    ["раз", "два"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const xText = await extractDocumentText("t.xlsx", xlsxBuf);
  console.log("OK t.xlsx:", JSON.stringify(xText.slice(0, 80)));

  // docx via mammoth needs real docx - create minimal zip with word/document.xml
  const JSZip = (await import("jszip")).default;
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
  zip.folder("word")!.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Документ Word</w:t></w:r></w:p></w:body>
</w:document>`,
  );
  const docxBuf = await zip.generateAsync({ type: "nodebuffer" });
  const dText = await extractDocumentText("t.docx", docxBuf);
  console.log("OK t.docx:", JSON.stringify(dText.slice(0, 80)));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("All extract smoke tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
