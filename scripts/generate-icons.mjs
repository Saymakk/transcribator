// Generate simple PNG tray/app icons (no external deps)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve("assets");
fs.mkdirSync(root, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(size, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = rgba(x, y);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function disc(size, color, letter) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.42;
  return png(size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= radius) {
      const nx = x / size;
      const ny = y / size;
      let bar = false;
      if (letter === "T") {
        bar =
          (ny > 0.28 && ny < 0.4 && nx > 0.28 && nx < 0.72) ||
          (nx > 0.44 && nx < 0.56 && ny > 0.28 && ny < 0.72);
      } else if (letter === "F") {
        bar =
          (nx > 0.34 && nx < 0.46 && ny > 0.28 && ny < 0.72) ||
          (ny > 0.28 && ny < 0.4 && nx > 0.34 && nx < 0.7) ||
          (ny > 0.46 && ny < 0.56 && nx > 0.34 && nx < 0.62);
      } else if (letter === "R") {
        bar =
          (nx > 0.34 && nx < 0.46 && ny > 0.28 && ny < 0.72) ||
          (ny > 0.28 && ny < 0.4 && nx > 0.34 && nx < 0.68) ||
          (ny > 0.46 && ny < 0.56 && nx > 0.34 && nx < 0.64) ||
          (nx > 0.55 && nx < 0.68 && ny > 0.56 && ny < 0.72);
      }
      if (bar) return [15, 20, 25, 255];
      return [color[0], color[1], color[2], 255];
    }
    return [0, 0, 0, 0];
  });
}

fs.writeFileSync(path.join(root, "icon.png"), disc(1024, [61, 184, 154], "T"));
fs.writeFileSync(path.join(root, "tray-off.png"), disc(32, [147, 164, 184], "T"));
fs.writeFileSync(path.join(root, "tray-forward.png"), disc(32, [91, 159, 212], "F"));
fs.writeFileSync(path.join(root, "tray-reverse.png"), disc(32, [194, 139, 219], "R"));

const pngData = fs.readFileSync(path.join(root, "icon.png"));
const ico = Buffer.alloc(22 + pngData.length);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 0;
ico[7] = 0;
ico[8] = 0;
ico[9] = 0;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(pngData.length, 14);
ico.writeUInt32LE(22, 18);
pngData.copy(ico, 22);
fs.writeFileSync(path.join(root, "icon.ico"), ico);

console.log("Icons written to assets/");
