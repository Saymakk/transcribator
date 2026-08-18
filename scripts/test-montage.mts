import assert from "node:assert/strict";
import {
  formatActorPrefix,
  montageLinesFromPlainText,
  parseActorLine,
  parseMontage,
  prefixCueWithActors,
} from "../src/shared/montage";

const known = new Set(["ДЖЭССИ", "БАЗЗ", "ХОРМЖ", "НДП", "ВУДИ"]);

assert.deepEqual(parseActorLine("НАСЫРОВА, ДЖЭССИ, ХАЙДИ, СЫН, ХОРМЖ,", known), {
  name: "НАСЫРОВА",
  roles: ["ДЖЭССИ", "ХАЙДИ", "СЫН", "ХОРМЖ"],
});
assert.equal(parseActorLine("ЭМИЛИ УЛИЦА РАНЧ, 1200", known), null);
assert.equal(parseActorLine("Друзья навек, ковбой!", known), null);

const lines = montageLinesFromPlainText(`
Toy Story 5
[ДЖЭССИ]
424
[БАЗЗ]
176
[НДП]
95
[ХОРМЖ]
9
НАСЫРОВА, ДЖЭССИ, ХАЙДИ, СЫН, ХОРМЖ,
ОРЛОВ, БАЗЗ, ХОРМЖ,
МАТВЕЕВ, НДП, ХОРМЖ,
00:03:00
[ЛАЙТЭР1]
Звезда.
00:05:25
[ДЖЭССИ]
О, боже
`);

// Mark Jessie tags as colored like the real montage.
for (const line of lines) {
  if (line.text === "[ДЖЭССИ]") line.colored = true;
}

const cast = parseMontage(lines);
assert.equal(cast.actors.length, 3);
assert.deepEqual(cast.roleToActors.get("ДЖЭССИ"), ["НАСЫРОВА"]);
assert.deepEqual(cast.roleToActors.get("БАЗЗ"), ["ОРЛОВ"]);
assert.deepEqual(cast.roleToActors.get("ХОРМЖ"), ["НАСЫРОВА", "ОРЛОВ", "МАТВЕЕВ"]);
assert.equal(cast.coloredRoles.has("ДЖЭССИ"), true);

assert.equal(formatActorPrefix("ДЖЭССИ", "0:05:25.00", cast), "НАСЫРОВА");
assert.equal(formatActorPrefix("БАЗЗ", "0:05:37.00", cast), "ОРЛОВ");
assert.equal(
  formatActorPrefix("ХОРМЖ", "0:03:15.02", cast),
  "НАСЫРОВА. ОРЛОВ. МАТВЕЕВ",
);
assert.equal(
  prefixCueWithActors("О, боже", "ДЖЭССИ", "0:05:25.00", cast),
  "НАСЫРОВА. О, боже",
);
assert.equal(prefixCueWithActors("Привет", "БАЗЗ", "0:07:13.00", cast), "ОРЛОВ. Привет");

console.log("montage parser OK");

const fs = await import("node:fs");
const path = await import("node:path");
const docxPath = "F:/toy story/Toy.Story.5 (3).docx";
const assPath = "F:/toy story/Toy.Story.5.ass";
if (fs.existsSync(docxPath) && fs.existsSync(assPath)) {
  const { extractMontageLines } = await import("../electron/documentExtract");
  const { assToSrt } = await import("../src/shared/assToSrt");
  const lines = await extractMontageLines(path.basename(docxPath), fs.readFileSync(docxPath));
  const live = parseMontage(lines);
  assert.equal(live.actors.length, 6);
  assert.equal(live.roleToActors.get("ДЖЭССИ")?.[0], "НАСЫРОВА");
  assert.equal(live.roleToActors.get("БАЗЗ")?.[0], "ОРЛОВ");
  assert.equal(live.roleToActors.get("ВУДИ")?.[0], "РУБЦОВ");
  assert.ok(live.coloredRoles.has("ДЖЭССИ"));
  assert.ok(live.coloredRoles.has("БЛЭЙЗ"));
  const srt = assToSrt(fs.readFileSync(assPath, "utf8"), {
    fields: ["Text"],
    separator: ". ",
    montage: live,
  });
  assert.match(srt, /НАСЫРОВА\. /);
  assert.match(srt, /ОРЛОВ\. /);
  assert.match(srt, /МАТВЕЕВ\. /);
  const jesseCue = [...srt.matchAll(/\d+\n[\d:,]+ --> [\d:,]+\n([^\n]+)/g)].find((m) =>
    m[1].includes("Друзья навек"),
  );
  assert.ok(jesseCue);
  assert.match(jesseCue![1], /^НАСЫРОВА\. /);
  console.log("live Toy Story files OK", {
    actors: live.actors.map((a) => a.name),
    coloredRoles: [...live.coloredRoles],
    sample: jesseCue![1],
  });
}
