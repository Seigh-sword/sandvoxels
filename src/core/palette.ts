export const BLOCK_AIR = 0;
export const BLOCK_GRASS = 1;
export const BLOCK_DIRT = 2;
export const BLOCK_STONE = 3;
export const BLOCK_LOG = 4;
export const BLOCK_LEAVES = 5;
export const BLOCK_SAND = 6;
export const BLOCK_SNOW = 7;
export const BLOCK_PLANKS = 8;
export const BLOCK_BRICK = 9;
export const BLOCK_COUNT = 9;

export const FACE_PX = 0;
export const FACE_NX = 1;
export const FACE_PY = 2;
export const FACE_NY = 3;
export const FACE_PZ = 4;
export const FACE_NZ = 5;

export const TILE_GRASS_TOP = 0;
export const TILE_DIRT = 1;
export const TILE_STONE = 2;
export const TILE_LOG_SIDE = 3;
export const TILE_LEAVES = 4;
export const TILE_SAND = 5;
export const TILE_SNOW = 6;
export const TILE_PLANKS = 7;
export const TILE_BRICK = 8;
export const TILE_GRASS_SIDE = 9;
export const TILE_LOG_TOP = 10;
export const TILE_SAND_UNDER = 11;
export const TILE_LEAVES_DENSE = 12;
export const TILE_STONE_DARK = 13;
export const TILE_SNOW_SIDE = 14;
export const TILE_SNOW_DIRT = 15;

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 1;
export const TILE_PX = 16;
export const ATLAS_PX = ATLAS_COLS * TILE_PX;

export const COLOR_GRASS_TOP = 0x75a74c;
export const COLOR_DIRT = 0x92704e;
export const COLOR_DIRT_DARK = 0x7c5c40;
export const COLOR_STONE = 0x999b94;
export const COLOR_LOG_SIDE = 0x795736;
export const COLOR_LEAVES = 0x59833a;
export const COLOR_SAND = 0xddc895;
export const COLOR_SNOW = 0xe5eeeb;
export const COLOR_PLANKS = 0xb5925c;
export const COLOR_BRICK = 0xa86049;

export function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  const positive = h < 0 ? h + 4294967296 : h;
  return positive / 4294967296;
}

export function tileForBlock(block: number, face: number): number {
  if (block === BLOCK_GRASS) {
    if (face === FACE_PY) return TILE_GRASS_TOP;
    if (face === FACE_NY) return TILE_DIRT;
    return TILE_GRASS_SIDE;
  }
  if (block === BLOCK_LOG) {
    if (face === FACE_PY || face === FACE_NY) return TILE_LOG_TOP;
    return TILE_LOG_SIDE;
  }
  if (block === BLOCK_DIRT) return TILE_DIRT;
  if (block === BLOCK_STONE) return TILE_STONE;
  if (block === BLOCK_LEAVES) return TILE_LEAVES;
  if (block === BLOCK_SAND) return TILE_SAND;
  if (block === BLOCK_SNOW) return TILE_SNOW;
  if (block === BLOCK_PLANKS) return TILE_PLANKS;
  return TILE_BRICK;
}

export function blockTopColor(block: number): number {
  if (block === BLOCK_GRASS) return COLOR_GRASS_TOP;
  if (block === BLOCK_DIRT) return COLOR_DIRT;
  if (block === BLOCK_STONE) return COLOR_STONE;
  if (block === BLOCK_LOG) return TILE_LOG_TOP;
  if (block === BLOCK_LEAVES) return COLOR_LEAVES;
  if (block === BLOCK_SAND) return COLOR_SAND;
  if (block === BLOCK_SNOW) return COLOR_SNOW;
  if (block === BLOCK_PLANKS) return COLOR_PLANKS;
  return COLOR_BRICK;
}

export function blockSideColor(block: number): number {
  if (block === BLOCK_GRASS) return COLOR_DIRT;
  if (block === BLOCK_DIRT) return COLOR_DIRT_DARK;
  if (block === BLOCK_STONE) return 0x737773;
  if (block === BLOCK_LOG) return COLOR_LOG_SIDE;
  if (block === BLOCK_LEAVES) return 0x426032;
  if (block === BLOCK_SAND) return 0xbda471;
  if (block === BLOCK_SNOW) return 0xb8d0d3;
  if (block === BLOCK_PLANKS) return 0x99754b;
  return 0x8f4d3c;
}

function shade(base: number, amount: number): number {
  const r = (base >> 16) & 255;
  const g = (base >> 8) & 255;
  const b = base & 255;
  const cr = Math.max(0, Math.min(255, Math.floor(r + amount)));
  const cg = Math.max(0, Math.min(255, Math.floor(g + amount)));
  const cb = Math.max(0, Math.min(255, Math.floor(b + amount)));
  return (cr << 16) | (cg << 8) | cb;
}

function putPixel(out: Uint8Array, tile: number, x: number, y: number, color: number, alpha: number): void {
  const offset = ((tile * TILE_PX + x) + y * ATLAS_PX) * 4;
  out[offset] = (color >> 16) & 255;
  out[offset + 1] = (color >> 8) & 255;
  out[offset + 2] = color & 255;
  out[offset + 3] = alpha;
}

export function renderAtlas(out: Uint8Array): void {
  for (let tile = 0; tile < ATLAS_COLS; tile++) {
    let base = COLOR_STONE;
    if (tile === TILE_GRASS_TOP || tile === TILE_GRASS_SIDE) base = COLOR_GRASS_TOP;
    if (tile === TILE_DIRT || tile === TILE_SNOW_DIRT) base = COLOR_DIRT;
    if (tile === TILE_LOG_SIDE) base = COLOR_LOG_SIDE;
    if (tile === TILE_LEAVES || tile === TILE_LEAVES_DENSE) base = COLOR_LEAVES;
    if (tile === TILE_SAND || tile === TILE_SAND_UNDER) base = COLOR_SAND;
    if (tile === TILE_SNOW || tile === TILE_SNOW_SIDE) base = COLOR_SNOW;
    if (tile === TILE_PLANKS) base = COLOR_PLANKS;
    if (tile === TILE_BRICK) base = COLOR_BRICK;
    if (tile === TILE_STONE_DARK) base = 0x737773;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const n = hash2(x, y, tile * 39);
        const amount = n > 0.5 ? (n - 0.5) * 42 : (n - 0.5) * 46;
        putPixel(out, tile, x, y, shade(base, amount), 255);
      }
    }
    if (tile === TILE_GRASS_SIDE) {
      for (let y = 4; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const n = hash2(x, y, 512);
          putPixel(out, tile, x, y, shade(COLOR_DIRT, n > 0.5 ? (n - 0.5) * 40 : (n - 0.5) * 44), 255);
        }
      }
      for (let x = 0; x < TILE_PX; x++) {
        const depth = 3 + Math.floor(hash2(x, 1, 6) * 4);
        for (let y = 0; y < depth; y++) {
          const n = hash2(x, y, 77);
          putPixel(out, tile, x, y, shade(y === depth - 1 ? 0x689644 : COLOR_GRASS_TOP, n > 0.5 ? 12 : -10), 255);
        }
      }
    }
    if (tile === TILE_LOG_SIDE) {
      for (let x = 2; x < TILE_PX; x += 4) {
        for (let y = 0; y < TILE_PX; y++) putPixel(out, tile, x, y, 0x5d432c, 255);
      }
    }
    if (tile === TILE_LOG_TOP) {
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const ring = Math.max(Math.abs(x - 7), Math.abs(y - 7));
          putPixel(out, tile, x, y, ring % 3 === 0 ? 0x7c603b : 0xb28d56, 255);
        }
      }
    }
    if (tile === TILE_PLANKS || tile === TILE_BRICK) {
      const mortar = tile === TILE_PLANKS ? 0x82683f : 0xb4aa90;
      for (let y = 3; y < TILE_PX; y += 4) {
        for (let x = 0; x < TILE_PX; x++) putPixel(out, tile, x, y, mortar, 255);
        const seam = y % 8 === 3 ? 4 : 12;
        for (let y2 = y - 3; y2 < y; y2++) putPixel(out, tile, seam, y2, mortar, 255);
      }
    }
  }
}
