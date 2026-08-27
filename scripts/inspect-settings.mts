import fs from "node:fs";
import path from "node:path";
import { transliterateLettersOnly } from "../src/shared/convert.ts";
import { createDefaultLayout } from "../electron/translit/defaultLayout.ts";

const p = path.join(process.env.APPDATA!, "transcribator", "settings.json");
const s = JSON.parse(fs.readFileSync(p, "utf8"));
const layout = s.layouts.find((l: { id: string }) => l.id === s.activeLayoutId);
const text = "Ехал грека через реку";
console.log("user layout out:", transliterateLettersOnly(text, layout, "forward"));
console.log("fresh default out:", transliterateLettersOnly(text, createDefaultLayout(), "forward"));
console.log("user ч:", layout.rules.find((r: { from: string }) => r.from === "ч"));
console.log("default ч:", createDefaultLayout().rules.find((r) => r.from === "ч"));
console.log("user rule count", layout.rules.length, "default", createDefaultLayout().rules.length);
// show if uppercase Ч exists
console.log(
  "user Ч/Х",
  layout.rules.filter((r: { from: string }) => r.from === "Ч" || r.from === "Х"),
);
