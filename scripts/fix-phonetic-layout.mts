import fs from "node:fs";
import path from "node:path";
import { createDefaultLayout } from "../electron/translit/defaultLayout.ts";
import { withRuleIds } from "../src/shared/ruleIds.ts";
import { transliterateLettersOnly } from "../src/shared/convert.ts";

const p = path.join(process.env.APPDATA!, "transcribator", "settings.json");
const s = JSON.parse(fs.readFileSync(p, "utf8"));
const fresh = createDefaultLayout();
const idx = s.layouts.findIndex((l: { id: string }) => l.id === "default-phonetic");
if (idx === -1) {
  console.error("default-phonetic layout not found");
  process.exit(1);
}
const prev = s.layouts[idx];
s.layouts[idx] = {
  ...prev,
  name: fresh.name,
  rules: withRuleIds(fresh.rules),
};
fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
const layout = s.layouts[idx];
console.log(
  "fixed:",
  transliterateLettersOnly("Ехал грека через реку", layout, "forward"),
);
console.log("ч:", layout.rules.find((r: { from: string }) => r.from === "ч"));
console.log("rules:", layout.rules.length);
