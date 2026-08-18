import assert from "node:assert/strict";
import {
  classifyUpdateFeed,
  isRemoteNewer,
  parseLatestYml,
} from "../src/shared/updateFeed";

const yml = `
version: 1.2.0
files:
  - url: Transcribator Setup 1.2.0.exe
    sha512: abc
    size: 12
path: Transcribator Setup 1.2.0.exe
sha512: abc
releaseDate: '2026-08-19T00:00:00.000Z'
`;

const meta = parseLatestYml(yml);
assert.equal(meta.version, "1.2.0");
assert.equal(meta.path, "Transcribator Setup 1.2.0.exe");
assert.equal(isRemoteNewer("1.2.0", "1.0.0"), true);
assert.equal(isRemoteNewer("1.0.0", "1.0.0"), false);
assert.equal(
  classifyUpdateFeed({
    provider: "generic",
    url: "https://disk.yandex.ru/d/abc123",
  }),
  "yandex",
);
assert.equal(
  classifyUpdateFeed({
    provider: "generic",
    url: "https://example.com/updates/",
  }),
  "generic-http",
);
assert.equal(
  classifyUpdateFeed({ provider: "github", url: "" }),
  "github",
);
console.log("updateFeed OK");
