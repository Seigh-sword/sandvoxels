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
export const BLOCK_CACTUS = 10;
export const BLOCK_MUSHROOM = 11;
export const BLOCK_ICE = 12;
export const BLOCK_MUD = 13;
export const BLOCK_SAVANNA = 14;
export const BLOCK_COUNT = 14;

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
export const TILE_CACTUS = 11;
export const TILE_MUSHROOM = 12;
export const TILE_ICE = 13;
export const TILE_MUD = 14;
export const TILE_SAVANNA = 15;

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
export const COLOR_CACTUS = 0x4e7a3a;
export const COLOR_MUSHROOM = 0xb0483c;
export const COLOR_ICE = 0x9fc6d8;
export const COLOR_MUD = 0x6b5636;
export const COLOR_SAVANNA = 0xa8a054;

import { hash2 } from './noise';

export function tileForBlock(block: number, face: number): number {
  if (block === BLOCK_GRASS) {
    if (face === FACE_PY) return TILE_GRASS_TOP;
    if (face === FACE_NY) return TILE_DIRT;
    return TILE_GRASS_SIDE;
  }
  if (block === BLOCK_SAVANNA) {
    if (face === FACE_PY) return TILE_SAVANNA;
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
  if (block === BLOCK_CACTUS) return TILE_CACTUS;
  if (block === BLOCK_MUSHROOM) return TILE_MUSHROOM;
  if (block === BLOCK_ICE) return TILE_ICE;
  if (block === BLOCK_MUD) return TILE_MUD;
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
  if (block === BLOCK_CACTUS) return COLOR_CACTUS;
  if (block === BLOCK_MUSHROOM) return COLOR_MUSHROOM;
  if (block === BLOCK_ICE) return COLOR_ICE;
  if (block === BLOCK_MUD) return COLOR_MUD;
  if (block === BLOCK_SAVANNA) return COLOR_SAVANNA;
  return COLOR_BRICK;
}

export function blockSideColor(block: number): number {
  if (block === BLOCK_GRASS) return COLOR_DIRT;
  if (block === BLOCK_SAVANNA) return COLOR_DIRT;
  if (block === BLOCK_DIRT) return COLOR_DIRT_DARK;
  if (block === BLOCK_STONE) return 0x737773;
  if (block === BLOCK_LOG) return COLOR_LOG_SIDE;
  if (block === BLOCK_LEAVES) return 0x426032;
  if (block === BLOCK_SAND) return 0xbda471;
  if (block === BLOCK_SNOW) return 0xb8d0d3;
  if (block === BLOCK_PLANKS) return 0x99754b;
  if (block === BLOCK_CACTUS) return 0x3d612d;
  if (block === BLOCK_MUSHROOM) return 0xd8cdb4;
  if (block === BLOCK_ICE) return 0x86b2c6;
  if (block === BLOCK_MUD) return 0x57452b;
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
    if (tile === TILE_DIRT) base = COLOR_DIRT;
    if (tile === TILE_LOG_SIDE) base = COLOR_LOG_SIDE;
    if (tile === TILE_LEAVES) base = COLOR_LEAVES;
    if (tile === TILE_SAND) base = COLOR_SAND;
    if (tile === TILE_SNOW) base = COLOR_SNOW;
    if (tile === TILE_PLANKS) base = COLOR_PLANKS;
    if (tile === TILE_BRICK) base = COLOR_BRICK;
    if (tile === TILE_CACTUS) base = COLOR_CACTUS;
    if (tile === TILE_MUSHROOM) base = COLOR_MUSHROOM;
    if (tile === TILE_ICE) base = COLOR_ICE;
    if (tile === TILE_MUD) base = COLOR_MUD;
    if (tile === TILE_SAVANNA) base = COLOR_SAVANNA;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const n = hash2(x, y, tile * 39);
        const amount = n > 0.5 ? (n - 0.5) * 42 : (n - 0.5) * 46;
        putPixel(out, tile, x, y, shade(base, amount), 255);
      }
    }
    if (tile === TILE_GRASS_SIDE || tile === TILE_SAVANNA) {
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
          const top = tile === TILE_SAVANNA ? COLOR_SAVANNA : COLOR_GRASS_TOP;
          putPixel(out, tile, x, y, shade(y === depth - 1 ? 0x689644 : top, n > 0.5 ? 12 : -10), 255);
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
    if (tile === TILE_CACTUS) {
      for (let y = 0; y < TILE_PX; y++) {
        putPixel(out, tile, 3, y, 0x3d612d, 255);
        putPixel(out, tile, 8, y, 0x639a49, 255);
        putPixel(out, tile, 12, y, 0x3d612d, 255);
      }
      for (let y = 2; y < TILE_PX; y += 5) {
        putPixel(out, tile, 2, y, 0xd8e6b0, 255);
        putPixel(out, tile, 9, y + 2, 0xd8e6b0, 255);
        putPixel(out, tile, 13, y + 4, 0xd8e6b0, 255);
      }
    }
    if (tile === TILE_MUSHROOM) {
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const blob = hash2(x >> 2, y >> 2, 91);
          if (blob > 0.62) putPixel(out, tile, x, y, 0xe8ddd0, 255);
        }
      }
    }
    if (tile === TILE_ICE) {
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(hash2(i, 3, 12) * 15);
        const y = Math.floor(hash2(i, 7, 13) * 15);
        putPixel(out, tile, x, y, 0xd7eaf2, 255);
        if (x + 1 < 16) putPixel(out, tile, x + 1, y, 0xc2dce8, 255);
      }
    }
    if (tile === TILE_MUD) {
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash2(i, 1, 21) * 14);
        const y = Math.floor(hash2(i, 2, 22) * 14);
        putPixel(out, tile, x, y, 0x4d3d26, 255);
        putPixel(out, tile, x + 1, y, 0x4d3d26, 255);
      }
    }
  }
}
