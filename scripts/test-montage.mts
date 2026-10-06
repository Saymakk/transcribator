import assert from "node:assert/strict";
import {
  formatActorPrefix,
  montageLinesFromPlainText,
  parseActorLine,
  parseDocxMontageXml,
  parseMontage,
  prefixCueWithActors,
} from "../src/shared/montage";

const known = new Set(["ДЖЭССИ", "БАЗЗ", "ХОРМЖ", "НДП", "ВУДИ"]);

assert.deepEqual(parseActorLine("НАСЫРОВА, ДЖЭССИ, ХАЙДИ, СЫН, ХОРМЖ,", known), {
  name: "НАСЫРОВА",
  roles: ["ДЖЭССИ", "ХАЙДИ", "СЫН", "ХОРМЖ"],
});
const pastorRoles = new Set(["МАЙКА", "АННА", "ЭРИКА", "ЭБИГЕЙЛ", "ДЖОНПОЛ", "ЭРИКА"]);
assert.deepEqual(
  parseActorLine("ИВАНОВА: МАЙКА, АННА, ЭРИКА, ЭБИГЕЙЛ,", pastorRoles),
  {
    name: "ИВАНОВА",
    roles: ["МАЙКА", "АННА", "ЭРИКА", "ЭБИГЕЙЛ"],
  },
);
assert.deepEqual(parseActorLine("ДАСЕВИЧ: ДЖОНПОЛ,", new Set(["ДЖОНПОЛ"])), {
  name: "ДАСЕВИЧ",
  roles: ["ДЖОНПОЛ"],
});
assert.deepEqual(parseActorLine("ОСТРОУХОВА: ЭРИКА,", new Set(["ЭРИКА"])), {
  name: "ОСТРОУХОВА",
  roles: ["ЭРИКА"],
});
assert.deepEqual(
  parseActorLine("НАБИЕВ: КОКС, ВОДИТЕЛЬ М 1, ДОКТОР ЛИФТ, МУЖ 1,", new Set(["КОКС", "ВОДИТЕЛЬМ1"])),
  {
    name: "НАБИЕВ",
    roles: ["КОКС", "ВОДИТЕЛЬМ1", "ДОКТОРЛИФТ", "МУЖ1"],
  },
);
assert.equal(parseActorLine("ЭМИЛИ УЛИЦА РАНЧ, 1200", known), null);
assert.equal(parseActorLine("Друзья навек, ковбой!", known), null);
assert.equal(parseActorLine("РОБ УИЛСОН, ДЕТЕКТИВ", new Set(["ДЕТЕКТИВ"])), null);
assert.deepEqual(
  parseActorLine("ГЛУШКОВСКИЙ: МУЖ1, ДЕТЕКТИВ,", new Set(["МУЖ1", "ДЕТЕКТИВ"])),
  { name: "ГЛУШКОВСКИЙ", roles: ["МУЖ1", "ДЕТЕКТИВ"] },
);

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

const glued = montageLinesFromPlainText(`
Ice Cream Man 2026
Персонаж
Число строк
[СТАРУШКА]
2
[ПАЙПЕР]
2
[ДЖАРЕД]
1
[МИА]
1
ДУЖЕНКОВА: СТАРУШКА, МИА, ХЭЗЕР, КОРШ: ПАЙПЕР, ДЖАРЕД,
`);
const gluedCast = parseMontage(glued);
assert.deepEqual(
  gluedCast.actors.map((a) => a.name),
  ["ДУЖЕНКОВА", "КОРШ"],
);
assert.deepEqual(gluedCast.roleToActors.get("СТАРУШКА"), ["ДУЖЕНКОВА"]);
assert.deepEqual(gluedCast.roleToActors.get("МИА"), ["ДУЖЕНКОВА"]);
assert.deepEqual(gluedCast.roleToActors.get("ПАЙПЕР"), ["КОРШ"]);
assert.deepEqual(gluedCast.roleToActors.get("ДЖАРЕД"), ["КОРШ"]);
assert.equal(gluedCast.roleToActors.has("ICECREAMMAN2026"), false);
assert.equal(
  gluedCast.actors.some((a) => /ice cream man/i.test(a.name)),
  false,
);

const outlander = montageLinesFromPlainText(`
Outlander.Blood.of.My.Blood
Мишутин, ДУГАЛ, ГЕНРИ, НДП,
Фёдоров (Новиков 03.10.2026), ДЖЭЙКОБ, ЛОВАТ, МАККИНИ,
Иванова Юля, ЭЛЛЕН, ДЖОКАСТА, ДАВИНА,
00:00
ЭЛЛЕН
Ранее.
ЧУЖЕСТРАНКА: КРОВЬ ОТ КРОВИ МОЕЙ
Тогда, прошу,
РОБ УИЛСОН, ДЕТЕКТИВ
`);
const outlanderCast = parseMontage(outlander);
assert.deepEqual(
  outlanderCast.actors.map((a) => a.name),
  ["Мишутин", "Фёдоров", "Иванова Юля"],
);
assert.deepEqual(outlanderCast.roleToActors.get("ДУГАЛ"), ["Мишутин"]);
assert.deepEqual(outlanderCast.roleToActors.get("ДЖЭЙКОБ"), ["Фёдоров"]);
assert.deepEqual(outlanderCast.roleToActors.get("ЛОВАТ"), ["Фёдоров"]);
assert.deepEqual(outlanderCast.roleToActors.get("МАККИНИ"), ["Фёдоров"]);
assert.deepEqual(outlanderCast.roleToActors.get("ЭЛЛЕН"), ["Иванова Юля"]);
assert.deepEqual(outlanderCast.roleToActors.get("ДЖОКАСТА"), ["Иванова Юля"]);
assert.equal(outlanderCast.roleToActors.has("ПРОШУ"), false);
assert.equal(outlanderCast.roleToActors.has("КРОВЬОТКРОВИМОЕЙ"), false);
assert.equal(outlanderCast.roleToActors.has("ДЕТЕКТИВ"), false);

const eden = montageLinesFromPlainText(`
[ЧАРЛЬЗ]
2
[АДАМ]
2
[КЭТИ]
1
[ЭЛИС]
1
[НДП]
1
РУБЦОВ: ЧАРЛЬЗ, ОЧКИ, ПРЕПОД,АННЕНКОВ: АДАМ, ДЖЕЙМС,
ВАЛЬЦ: ТОМАС, НДП, БРАК2,ИВАНОВА: КЭТИ, КЭТ,СМЕТАНИНА: ЭЛИС, ДЕВ22,
00:07
[ЧАРЛЬЗ]
Текст.
`);
const edenCast = parseMontage(eden);
assert.deepEqual(
  edenCast.actors.map((a) => a.name),
  ["РУБЦОВ", "АННЕНКОВ", "ВАЛЬЦ", "ИВАНОВА", "СМЕТАНИНА"],
);
assert.deepEqual(edenCast.roleToActors.get("ЧАРЛЬЗ"), ["РУБЦОВ"]);
assert.deepEqual(edenCast.roleToActors.get("ОЧКИ"), ["РУБЦОВ"]);
assert.deepEqual(edenCast.roleToActors.get("АДАМ"), ["АННЕНКОВ"]);
assert.deepEqual(edenCast.roleToActors.get("КЭТИ"), ["ИВАНОВА"]);
assert.deepEqual(edenCast.roleToActors.get("ЭЛИС"), ["СМЕТАНИНА"]);
assert.deepEqual(edenCast.roleToActors.get("НДП"), ["ВАЛЬЦ"]);

const broken = montageLinesFromPlainText(`
[КЭЛ]
1
[КЭТИ]
1
[ЭЛИС]
1
[ТОМАС]
1
ВАЛЬЦ: ТОМАС, НДП,
КЭЛ, МУЖ3, ПРОДАВЕЦ,
ИВАНОВА: КЭТИ, ЖЕН1,
-СМЕТАНИНА: ЭЛИС, ДЕВ22,
00:06
`);
const brokenCast = parseMontage(broken);
assert.deepEqual(
  brokenCast.actors.map((a) => a.name),
  ["ВАЛЬЦ", "ИВАНОВА", "СМЕТАНИНА"],
);
assert.deepEqual(brokenCast.roleToActors.get("КЭЛ"), ["ВАЛЬЦ"]);
assert.deepEqual(brokenCast.roleToActors.get("ПРОДАВЕЦ"), ["ВАЛЬЦ"]);
assert.deepEqual(brokenCast.roleToActors.get("КЭТИ"), ["ИВАНОВА"]);
assert.deepEqual(brokenCast.roleToActors.get("ЭЛИС"), ["СМЕТАНИНА"]);

import { parseDocxMontageXml } from "../src/shared/montage";

assert.deepEqual(
  parseDocxMontageXml(
    `<w:p><w:r><w:t>КЭЛ, МУЖ3,</w:t></w:r><w:r><w:br/></w:r><w:r><w:br/><w:t>ИВАНОВА:</w:t></w:r><w:r><w:t> КЭТИ,</w:t></w:r></w:p>`,
  ).map((line) => line.text),
  ["КЭЛ, МУЖ3,", "ИВАНОВА: КЭТИ,"],
);

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
