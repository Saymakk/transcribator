import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const releaseDir = path.join(process.cwd(), "release");
if (!fs.existsSync(releaseDir)) {
  console.error("No release/ folder. Run npm run dist:win first.");
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);
const exe = files.find((f) => /^Transcribator Setup .+\.exe$/i.test(f) && !f.endsWith(".blockmap"));
if (!exe) {
  console.error("NSIS installer not found in release/");
  process.exit(1);
}

const exePath = path.join(releaseDir, exe);
const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash("sha512").update(buf).digest("base64");
const size = buf.length;
const version = String(pkg.version);
const releaseDate = new Date().toISOString();

const yml = [
  `version: ${version}`,
  "files:",
  `  - url: ${exe}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${exe}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  "",
].join("\n");

const out = path.join(releaseDir, "latest.yml");
fs.writeFileSync(out, yml, "utf8");

const blockmap = `${exe}.blockmap`;
const hasBlockmap = fs.existsSync(path.join(releaseDir, blockmap));

console.log(`Wrote ${out}`);
console.log("");
console.log("Upload these files to a public Yandex Disk folder (or any HTTPS directory):");
console.log(`  - latest.yml`);
console.log(`  - ${exe}`);
if (hasBlockmap) console.log(`  - ${blockmap}  (enables partial download on GitHub / HTTP)`);
console.log("");
console.log("Then in the app: Settings → Updates → Custom URL → paste the public folder link.");
