import { createDefaultLayout } from "../electron/translit/defaultLayout.ts";
import {
  findReverseConflicts,
  transliterateForward,
  transliterateReverse,
  transliterateWord,
} from "../electron/translit/engine.ts";

const layout = createDefaultLayout();

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(transliterateForward("привет", layout) === "privet", "привет");
assert(transliterateForward("щека", layout).startsWith("ŝ"), "щ longest");
assert(transliterateWord("Привет", layout, "forward") === "Privet", "case");
assert(transliterateReverse("privet", layout) === "привет", "reverse");

const conflicts = findReverseConflicts([
  { from: "я", to: "ja" },
  { from: "йа", to: "ja" },
]);
assert(conflicts.length === 1, "conflict detected");
assert(conflicts[0].fromOptions.includes("йа"), "longer key listed");

console.log("engine tests passed");
