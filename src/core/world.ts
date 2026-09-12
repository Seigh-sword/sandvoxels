import { hash2 } from './palette';

export const WORLD_SIZE = 80;
export const WORLD_HALF = 40;
export const WORLD_HEIGHT = 44;
export const CHUNK_SIZE = 16;
export const EYE_HEIGHT = 1.65;

export const BIOME_FOREST = 0;
export const BIOME_DESERT = 1;
export const BIOME_ALPINE = 2;

export const MODE_EXPLORER = 0;
export const MODE_CREATIVE = 1;

export const BLOCK_GRASS_ID = 1;
export const BLOCK_DIRT_ID = 2;
export const BLOCK_STONE_ID = 3;
export const BLOCK_LOG_ID = 4;
export const BLOCK_LEAVES_ID = 5;
export const BLOCK_SAND_ID = 6;
export const BLOCK_SNOW_ID = 7;

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

export class World {
  data: Uint8Array;
  seed: number;
  biome: number;
  mode: number;
  editKeys: Int32Array;
  editValues: Uint8Array;
  editCount: number;
  editCapacity: number;

  constructor(seed: number, biome: number, mode: number) {
    this.data = new Uint8Array(WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT);
    this.seed = seed;
    this.biome = biome;
    this.mode = mode;
    this.editKeys = new Int32Array(64);
    this.editValues = new Uint8Array(64);
    this.editCount = 0;
    this.editCapacity = 64;
    this.generate();
  }

  index(x: number, y: number, z: number): number {
    return (x + WORLD_HALF) + (z + WORLD_HALF) * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= -WORLD_HALF && x < WORLD_HALF && z >= -WORLD_HALF && z < WORLD_HALF && y >= 0 && y < WORLD_HEIGHT;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.data[this.index(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, value: number): void {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = value;
  }

  terrainHeight(x: number, z: number): number {
    const mountain = this.biome === BIOME_ALPINE ? 20 : this.biome === BIOME_DESERT ? 12 : 9;
    let h = 3 + noise2(x / 23, z / 23, this.seed) * mountain + noise2(x / 8, z / 8, this.seed + 1) * 3;
    const river = Math.abs(x - Math.sin(z / 13 + this.seed) * 7 + 4);
    if (this.biome !== BIOME_DESERT && river < 5) {
      const t = Math.max(0, (river - 2) / 3);
      h = 1.4 * (1 - t) + h * t;
    }
    return Math.floor(h);
  }

  generate(): void {
    for (let x = -WORLD_HALF; x < WORLD_HALF; x++) {
      for (let z = -WORLD_HALF; z < WORLD_HALF; z++) {
        const h = this.terrainHeight(x, z);
        for (let y = 0; y <= h; y++) {
          let value = BLOCK_STONE_ID;
          if (y === h) value = this.biome === BIOME_DESERT || h < 3 ? BLOCK_SAND_ID : this.biome === BIOME_ALPINE ? BLOCK_SNOW_ID : BLOCK_GRASS_ID;
          else if (y > h - 3) value = this.biome === BIOME_DESERT ? BLOCK_SAND_ID : BLOCK_DIRT_ID;
          this.setBlock(x, y, z, value);
        }
      }
    }
    for (let x = -WORLD_HALF + 3; x < WORLD_HALF - 3; x++) {
      for (let z = -WORLD_HALF + 3; z < WORLD_HALF - 3; z++) {
        const h = this.terrainHeight(x, z);
        if (h < 4) continue;
        if (hash2(x, z, this.seed + 18) < 0.984) continue;
        if (Math.abs(x - 11) < 3 && Math.abs(z - 17) < 3) continue;
        if (this.biome === BIOME_DESERT) {
          for (let y = 1; y < 4; y++) this.setBlock(x, h + y, z, BLOCK_LEAVES_ID);
          this.setBlock(x + 1, h + 2, z, BLOCK_LEAVES_ID);
          this.setBlock(x + 1, h + 3, z, BLOCK_LEAVES_ID);
        } else {
          const trunk = this.biome === BIOME_ALPINE ? 6 : 4;
          for (let y = 1; y <= trunk; y++) this.setBlock(x, h + y, z, BLOCK_LOG_ID);
          for (let dy = -2; dy <= 1; dy++) {
            let radius = 2;
            if (this.biome === BIOME_ALPINE) radius = Math.max(1, 2 - Math.max(0, dy));
            else if (dy === 1) radius = 1;
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) === radius && Math.abs(dz) === radius && hash2(dx + x, dz + z, dy) < 0.5) continue;
                if (dx === 0 && dz === 0 && dy <= 0) continue;
                this.setBlock(x + dx, h + trunk + dy, z + dz, this.biome === BIOME_ALPINE && dy === 1 ? BLOCK_SNOW_ID : BLOCK_LEAVES_ID);
              }
            }
          }
        }
      }
    }
  }

  surface(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.getBlock(x, y, z) > 0) return y;
    }
    return 0;
  }

  private findEdit(x: number, y: number, z: number): number {
    const key = this.index(x, y, z);
    for (let i = 0; i < this.editCount; i++) {
      if (this.editKeys[i] === key) return i;
    }
    return -1;
  }

  private rememberEdit(x: number, y: number, z: number, value: number): void {
    const slot = this.findEdit(x, y, z);
    if (slot >= 0) {
      this.editValues[slot] = value;
      return;
    }
    if (this.editCount >= this.editCapacity) {
      const capacity = this.editCapacity * 2;
      const nextKeys = new Int32Array(capacity);
      const nextValues = new Uint8Array(capacity);
      for (let i = 0; i < this.editCount; i++) {
        nextKeys[i] = this.editKeys[i];
        nextValues[i] = this.editValues[i];
      }
      this.editKeys = nextKeys;
      this.editValues = nextValues;
      this.editCapacity = capacity;
    }
    this.editKeys[this.editCount] = this.index(x, y, z);
    this.editValues[this.editCount] = value;
    this.editCount = this.editCount + 1;
  }

  edit(x: number, y: number, z: number, value: number): void {
    this.setBlock(x, y, z, value);
    this.rememberEdit(x, y, z, value);
  }

  applySavedEdits(keys: Int32Array, values: Uint8Array, count: number): void {
    for (let i = 0; i < count; i++) {
      const packed = keys[i];
      const y = Math.floor(packed / (WORLD_SIZE * WORLD_SIZE));
      const rest = packed - y * WORLD_SIZE * WORLD_SIZE;
      const z = Math.floor(rest / WORLD_SIZE) - WORLD_HALF;
      const x = rest - (z + WORLD_HALF) * WORLD_SIZE - WORLD_HALF;
      this.setBlock(x, y, z, values[i]);
      this.rememberEdit(x, y, z, values[i]);
    }
  }
}
