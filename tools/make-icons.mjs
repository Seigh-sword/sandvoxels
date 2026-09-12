import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'public');
fs.mkdirSync(outDir, { recursive: true });

const CUBE = [
  '.....tt.....',
  '....tttt....',
  '...tttttt...',
  '..tttttttt..',
  '.tttttttttt.',
  '.lllllrrrrr.',
  '.lllllrrrrr.',
  '.lllllrrrrr.',
  '.lllllrrrrr.',
  '.lllllrrrrr.',
  '..llllrrrr..',
  '...llrrrr...',
];
const COLORS = { t: [166, 212, 105], l: [111, 156, 68], r: [77, 118, 52] };

function cubePng(size, file) {
  const scale = size / 12;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = CUBE[Math.floor(y / scale)][Math.floor(x / scale)];
      const di = (y * size + x) * 4;
      if (ch === '.') {
        png.data[di + 3] = 0;
        continue;
      }
      const [r, g, b] = COLORS[ch];
      png.data[di] = r;
      png.data[di + 1] = g;
      png.data[di + 2] = b;
      png.data[di + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(outDir, file), PNG.sync.write(png));
  console.log(`${file} ${size}x${size}`);
}

function upscale(srcFile, factor, outFile) {
  const src = PNG.sync.read(fs.readFileSync(path.join(root, 'src/assets', srcFile)));
  const width = src.width * factor;
  const height = src.height * factor;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (Math.floor(y / factor) * src.width + Math.floor(x / factor)) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(outDir, outFile), PNG.sync.write(out));
  console.log(`${outFile} ${width}x${height}`);
}

cubePng(192, 'icon-192.png');
cubePng(512, 'icon-512.png');
cubePng(180, 'apple-touch-icon.png');
upscale('forest.png', 5, 'og.png');
