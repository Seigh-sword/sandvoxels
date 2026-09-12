import { hash2 } from './noise';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 44;
export const WATER_Y = 2.7;
export const SEA_BLOCK = 3;
export const EYE_HEIGHT = 1.65;

export const CHUNK_SLOTS = 96;
export const HASH_SLOTS = 256;

export const BIOME_FOREST = 0;
export const BIOME_PLAINS = 1;
export const BIOME_DESERT = 2;
export const BIOME_ALPINE = 3;
export const BIOME_TUNDRA = 4;
export const BIOME_SWAMP = 5;
export const BIOME_SAVANNA = 6;
export const BIOME_BADLANDS = 7;
export const BIOME_JUNGLE = 8;
export const BIOME_COUNT = 9;

export const MODE_EXPLORER = 0;
export const MODE_CREATIVE = 1;

export const BLOCK_GRASS_ID = 1;
export const BLOCK_DIRT_ID = 2;
export const BLOCK_STONE_ID = 3;
export const BLOCK_LOG_ID = 4;
export const BLOCK_LEAVES_ID = 5;
export const BLOCK_SAND_ID = 6;
export const BLOCK_SNOW_ID = 7;
export const BLOCK_CACTUS_ID = 10;
export const BLOCK_MUSHROOM_ID = 11;
export const BLOCK_ICE_ID = 12;
export const BLOCK_MUD_ID = 13;
export const BLOCK_SAVANNA_ID = 14;

const BIOME_HEIGHT = [9, 6, 12, 20, 8, 4, 7, 10, 10];
const BIOME_TREE = [16, 4, 3, 10, 8, 10, 5, 0, 20];
const BIOME_KIND = [0, 0, 2, 1, 1, 3, 4, 0, 6];
const BIOME_TOP = [1, 1, 6, 7, 7, 1, 14, 13, 1];
const BIOME_SUB = [2, 2, 6, 3, 2, 13, 2, 13, 2];
const BIOME_RIVER = [1, 1, 0, 1, 1, 0, 1, 0, 1];
const BIOME_SKY = [0xb0d5df, 0xaed8e6, 0xe9c6a0, 0xb0d5df, 0xc3d8e2, 0xa9c3b4, 0xe6cf9a, 0xe0b489, 0x9fd0c8];
const BIOME_WATER = [0x489fb8, 0x489fb8, 0x3f8fa8, 0xa0d6e0, 0x8fc4d4, 0x5d8f6d, 0x4f9aa8, 0x6d8f9a, 0x3f9a86];
const BIOME_ALT_A = [1, 0, 7, 4, 3, 8, 1, 2, 5];
const BIOME_ALT_B = [8, 6, 6, 0, 1, 0, 2, 6, 0];

export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

export function biomeAt(base: number, x: number, z: number, seed: number): number {
  const zone = noise2(x / 260, z / 260, seed + 900);
  if (zone < 0.46) return base;
  const pick = noise2(x / 260 + 31.7, z / 260 - 11.3, seed + 901);
  return pick < 0.5 ? BIOME_ALT_A[base] : BIOME_ALT_B[base];
}

export function biomeSky(biome: number): number {
  return BIOME_SKY[biome];
}

export function biomeWater(biome: number): number {
  return BIOME_WATER[biome];
}

export class World {
  seed: number;
  biome: number;
  mode: number;
  chunks: Uint8Array;
  slotKey: Int32Array;
  slotUsed: Uint8Array;
  slotTick: Int32Array;
  hashMap: Int32Array;
  clock: number;
  editXZ: Int32Array;
  editY: Uint8Array;
  editValues: Uint8Array;
  editCount: number;
  editCapacity: number;

  constructor(seed: number, biome: number, mode: number) {
    this.seed = seed;
    this.biome = biome;
    this.mode = mode;
    this.chunks = new Uint8Array(CHUNK_SLOTS * CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.slotKey = new Int32Array(CHUNK_SLOTS);
    this.slotUsed = new Uint8Array(CHUNK_SLOTS);
    this.slotTick = new Int32Array(CHUNK_SLOTS);
    this.hashMap = new Int32Array(HASH_SLOTS);
    this.clock = 0;
    this.editXZ = new Int32Array(64);
    this.editY = new Uint8Array(64);
    this.editValues = new Uint8Array(64);
    this.editCount = 0;
    this.editCapacity = 64;
    for (let i = 0; i < CHUNK_SLOTS; i++) this.slotUsed[i] = 0;
    for (let i = 0; i < HASH_SLOTS; i++) this.hashMap[i] = -1;
  }

  chunkKey(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  hashOf(key: number): number {
    const mixed = Math.imul(key, 2654435761);
    const positive = mixed < 0 ? mixed + 4294967296 : mixed;
    return positive % HASH_SLOTS;
  }

  rebuildHash(): void {
    for (let i = 0; i < HASH_SLOTS; i++) this.hashMap[i] = -1;
    for (let slot = 0; slot < CHUNK_SLOTS; slot++) {
      if (!this.slotUsed[slot]) continue;
      let h = this.hashOf(this.slotKey[slot]);
      while (this.hashMap[h] >= 0) h = (h + 1) % HASH_SLOTS;
      this.hashMap[h] = slot;
    }
  }

  findSlot(cx: number, cz: number): number {
    const key = this.chunkKey(cx, cz);
    let h = this.hashOf(key);
    for (let probe = 0; probe < 8; probe++) {
      const slot = this.hashMap[h];
      if (slot < 0) return -1;
      if (this.slotKey[slot] === key) return slot;
      h = (h + 1) % HASH_SLOTS;
    }
    return -1;
  }

  loadChunk(cx: number, cz: number): number {
    const existing = this.findSlot(cx, cz);
    if (existing >= 0) {
      this.clock = this.clock + 1;
      this.slotTick[existing] = this.clock;
      return existing;
    }
    let slot = -1;
    for (let i = 0; i < CHUNK_SLOTS; i++) {
      if (!this.slotUsed[i]) { slot = i; break; }
    }
    if (slot < 0) {
      let oldest = 0;
      for (let i = 1; i < CHUNK_SLOTS; i++) {
        if (this.slotTick[i] < this.slotTick[oldest]) oldest = i;
      }
      slot = oldest;
      this.slotUsed[slot] = 0;
      this.rebuildHash();
    }
    this.slotKey[slot] = this.chunkKey(cx, cz);
    this.slotUsed[slot] = 1;
    this.clock = this.clock + 1;
    this.slotTick[slot] = this.clock;
    let h = this.hashOf(this.slotKey[slot]);
    while (this.hashMap[h] >= 0) h = (h + 1) % HASH_SLOTS;
    this.hashMap[h] = slot;
    this.generateChunk(slot, cx, cz);
    return slot;
  }

  slotAt(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return this.loadChunk(cx, cz);
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const slot = this.slotAt(x, z);
    const lx = x - Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE;
    const lz = z - Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE;
    return this.chunks[slotBase(slot) + lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  setBlock(x: number, y: number, z: number, value: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const slot = this.slotAt(x, z);
    const lx = x - Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE;
    const lz = z - Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE;
    this.chunks[slotBase(slot) + lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = value;
  }

  terrainHeight(biome: number, x: number, z: number): number {
    const mountain = BIOME_HEIGHT[biome];
    let h = 3 + noise2(x / 23, z / 23, this.seed) * mountain + noise2(x / 8, z / 8, this.seed + 1) * 3;
    if (biome === BIOME_BADLANDS) {
      const band = Math.floor((h + noise2(x / 3, z / 3, this.seed + 5) * 2) / 3) * 3;
      h = band + 1;
    }
    if (biome === BIOME_SWAMP) {
      const wet = noise2(x / 17, z / 17, this.seed + 9);
      h = wet < 0.45 ? 2 : 4 + noise2(x / 11, z / 11, this.seed + 2) * 2;
    }
    if (BIOME_RIVER[biome] === 1) {
      const river = Math.abs(x - Math.sin(z / 13 + this.seed) * 7 + 4);
      if (river < 5) {
        const t = Math.max(0, (river - 2) / 3);
        h = 1.4 * (1 - t) + h * t;
      }
    }
    return Math.floor(h);
  }

  treeAt(biome: number, x: number, z: number): number {
    const density = BIOME_TREE[biome];
    if (density <= 0) return 0;
    if (hash2(x, z, this.seed + 18) * 1000 > density) return 0;
    return BIOME_KIND[biome] + 1;
  }

  generateChunk(slot: number, cx: number, cz: number): void {
    const base = slotBase(slot);
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT; i++) this.chunks[base + i] = 0;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = cx * CHUNK_SIZE + lx;
        const z = cz * CHUNK_SIZE + lz;
        const biome = biomeAt(this.biome, x, z, this.seed);
        const h = this.terrainHeight(biome, x, z);
        for (let y = 0; y <= h && y < WORLD_HEIGHT; y++) {
          let value = BLOCK_STONE_ID;
          if (y === h) value = BIOME_TOP[biome];
          else if (y > h - 3) value = BIOME_SUB[biome];
          this.chunks[base + lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = value;
        }
        if (biome === BIOME_TUNDRA || biome === BIOME_ALPINE) {
          if (h < SEA_BLOCK) {
            for (let y = h + 1; y <= SEA_BLOCK; y++) {
              this.chunks[base + lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = BLOCK_ICE_ID;
            }
          }
        }
      }
    }
    for (let tx = cx * CHUNK_SIZE - 3; tx < cx * CHUNK_SIZE + CHUNK_SIZE + 3; tx++) {
      for (let tz = cz * CHUNK_SIZE - 3; tz < cz * CHUNK_SIZE + CHUNK_SIZE + 3; tz++) {
        const biome = biomeAt(this.biome, tx, tz, this.seed);
        const kind = this.treeAt(biome, tx, tz);
        if (kind === 0) continue;
        const h = this.terrainHeight(biome, tx, tz);
        if (h < SEA_BLOCK) continue;
        this.placeTree(base, cx, cz, biome, kind, tx, tz, h);
      }
    }
    for (let i = 0; i < this.editCount; i++) {
      const packed = this.editXZ[i];
      const ex = Math.floor(packed / 8192) - 4096;
      const ez = packed - (ex + 4096) * 8192 - 4096;
      if (ex < cx * CHUNK_SIZE || ex >= cx * CHUNK_SIZE + CHUNK_SIZE) continue;
      if (ez < cz * CHUNK_SIZE || ez >= cz * CHUNK_SIZE + CHUNK_SIZE) continue;
      const lx = ex - cx * CHUNK_SIZE;
      const lz = ez - cz * CHUNK_SIZE;
      this.chunks[base + lx + lz * CHUNK_SIZE + this.editY[i] * CHUNK_SIZE * CHUNK_SIZE] = this.editValues[i];
    }
  }

  putTree(base: number, cx: number, cz: number, px: number, py: number, pz: number, value: number): void {
    const lx = px - cx * CHUNK_SIZE;
    const lz = pz - cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    if (py < 0 || py >= WORLD_HEIGHT) return;
    this.chunks[base + lx + lz * CHUNK_SIZE + py * CHUNK_SIZE * CHUNK_SIZE] = value;
  }

  placeTree(base: number, cx: number, cz: number, _biome: number, kind: number, x: number, z: number, h: number): void {
    const leaf = BLOCK_LEAVES_ID;
    if (kind === 3) {
      for (let y = 1; y < 4; y++) this.putTree(base, cx, cz, x, h + y, z, BLOCK_CACTUS_ID);
      return;
    }
    if (kind === 7) {
      for (let y = 1; y < 3; y++) this.putTree(base, cx, cz, x, h + y, z, BLOCK_MUSHROOM_ID);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) this.putTree(base, cx, cz, x + dx, h + 3, z + dz, BLOCK_MUSHROOM_ID);
      }
      this.putTree(base, cx, cz, x, h + 4, z, BLOCK_MUSHROOM_ID);
      return;
    }
    const trunk = kind === 2 || kind === 6 ? 6 : 4;
    for (let y = 1; y <= trunk; y++) this.putTree(base, cx, cz, x, h + y, z, BLOCK_LOG_ID);
    if (kind === 5) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash2(x + dx, z + dz, 4) < 0.5) continue;
          this.putTree(base, cx, cz, x + dx, h + trunk, z + dz, leaf);
        }
      }
      this.putTree(base, cx, cz, x, h + trunk + 1, z, leaf);
      return;
    }
    for (let dy = -2; dy <= 1; dy++) {
      let radius = 2;
      if (kind === 2 || kind === 6) radius = Math.max(1, 2 - Math.max(0, dy));
      else if (dy === 1) radius = 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && hash2(dx + x, dz + z, dy) < 0.5) continue;
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          const top = kind === 2 && dy === 1 ? BLOCK_SNOW_ID : leaf;
          this.putTree(base, cx, cz, x + dx, h + trunk + dy, z + dz, top);
        }
      }
    }
    if (kind === 6) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) this.putTree(base, cx, cz, x + dx, h + trunk + 2, z + dz, leaf);
      }
    }
  }

  surface(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.getBlock(x, y, z) !== 0) return y;
    }
    return 0;
  }

  findEdit(x: number, y: number, z: number): number {
    const packed = (x + 4096) * 8192 + (z + 4096);
    for (let i = 0; i < this.editCount; i++) {
      if (this.editXZ[i] === packed && this.editY[i] === y) return i;
    }
    return -1;
  }

  rememberEdit(x: number, y: number, z: number, value: number): void {
    const slot = this.findEdit(x, y, z);
    if (slot >= 0) {
      this.editValues[slot] = value;
      return;
    }
    if (this.editCount >= this.editCapacity) {
      const capacity = this.editCapacity * 2;
      const nextXZ = new Int32Array(capacity);
      const nextY = new Uint8Array(capacity);
      const nextValues = new Uint8Array(capacity);
      for (let i = 0; i < this.editCount; i++) {
        nextXZ[i] = this.editXZ[i];
        nextY[i] = this.editY[i];
        nextValues[i] = this.editValues[i];
      }
      this.editXZ = nextXZ;
      this.editY = nextY;
      this.editValues = nextValues;
      this.editCapacity = capacity;
    }
    this.editXZ[this.editCount] = (x + 4096) * 8192 + (z + 4096);
    this.editY[this.editCount] = y;
    this.editValues[this.editCount] = value;
    this.editCount = this.editCount + 1;
  }

  edit(x: number, y: number, z: number, value: number): void {
    this.setBlock(x, y, z, value);
    this.rememberEdit(x, y, z, value);
  }

  applySavedEdits(xz: Int32Array, ys: Uint8Array, values: Uint8Array, count: number): void {
    for (let i = 0; i < count; i++) {
      const ex = Math.floor(xz[i] / 8192) - 4096;
      const ez = xz[i] - (ex + 4096) * 8192 - 4096;
      this.setBlock(ex, ys[i], ez, values[i]);
      this.rememberEdit(ex, ys[i], ez, values[i]);
    }
  }
}

export function slotBase(slot: number): number {
  return slot * CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
}
