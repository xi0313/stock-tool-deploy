// 生成 PWA 图标（纯 Node，无依赖，用 zlib 手写 PNG）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const w = size, h = size;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // 每行：filter byte 0 + RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  let off = 0;
  const cx = w / 2, cy = h / 2, r = w * 0.46;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0; // filter none
    for (let x = 0; x < w; x++) {
      let R = 192, G = 57, B = 43; // 深红背景
      // 圆形渐变效果：内圈亮一点
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < r) {
        const t = dist / r;
        R = Math.round(220 - 30 * t);
        G = Math.round(80 - 30 * t);
        B = Math.round(60 - 25 * t);
      }
      // 画一个向上的 K 线箭头（白色）
      const kx = Math.abs(x - cx), ky = y - cy;
      // 竖线（影线）：中央窄条
      if (kx < w * 0.05 && Math.abs(ky) < r * 0.85) { R = 255; G = 255; B = 255; }
      // 横线（K线实体下沿）
      if (kx < w * 0.22 && Math.abs(ky - r * 0.2) < w * 0.06) { R = 255; G = 255; B = 255; }
      // 上沿
      if (kx < w * 0.14 && Math.abs(ky + r * 0.25) < w * 0.06) { R = 255; G = 255; B = 255; }
      raw[off++] = R; raw[off++] = G; raw[off++] = B; raw[off++] = 255;
    }
  }

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const dir = path.join(__dirname, '..', 'icons');
fs.writeFileSync(path.join(dir, 'icon-192.png'), makePng(192));
fs.writeFileSync(path.join(dir, 'icon-512.png'), makePng(512));
console.log('icons generated');
