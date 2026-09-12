import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'tmp-art');
const target = path.join(root, 'src/assets');
const WIDTH = 192;
const HEIGHT = 108;

fs.mkdirSync(target, { recursive: true });

for (const name of ['forest', 'desert', 'alpine']) {
  const input = path.join(source, `${name}.png`);
  if (!fs.existsSync(input)) {
    console.log(`missing ${input}: drop a source render into tmp-art first`);
    continue;
  }
  const src = PNG.sync.read(fs.readFileSync(input));
  const out = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sx = Math.floor((x * src.width) / WIDTH);
      const sy = Math.floor((y * src.height) / HEIGHT);
      const si = (sy * src.width + sx) * 4;
      const di = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++) out.data[di + c] = Math.round(src.data[si + c] / 24) * 24;
      out.data[di + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(target, `${name}.png`), PNG.sync.write(out));
  console.log(`${name}.png ${fs.statSync(path.join(target, `${name}.png`)).size} bytes`);
}
