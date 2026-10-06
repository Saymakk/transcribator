import fs from "node:fs";
import JSZip from "jszip";
import { parseDocxMontageXml, parseMontage, normalizeRole } from "../src/shared/montage.ts";
import { parseAss } from "../src/shared/assToSrt.ts";

const dir = "f:/east of eden/e7";
const docx = fs.readdirSync(dir).find((n) => n.toLowerCase().endsWith(".docx"))!;
const zip = await JSZip.loadAsync(fs.readFileSync(`${dir}/${docx}`));
const xml = await zip.file("word/document.xml")!.async("string");
const lines = parseDocxMontageXml(xml);
const idx = lines.findIndex((l) => l.text.includes("ИВАНОВА") || l.text.includes("СМЕТАНИНА") || l.text.includes("КЭЛ,"));
console.log(lines.slice(idx, idx + 8).map((l) => JSON.stringify(l.text)).join("\n"));
const cast = parseMontage(lines);
console.log(cast.actors.map((a) => a.name).join(", "));
console.log("ЭЛИС", cast.roleToActors.get("ЭЛИС"));
