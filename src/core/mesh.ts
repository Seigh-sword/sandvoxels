import { CHUNK_SIZE, WORLD_HALF, WORLD_HEIGHT, World } from './world';
import { ATLAS_COLS, TILE_PX, tileForBlock } from './palette';

const FACE_DIR_X = [1, -1, 0, 0, 0, 0];
const FACE_DIR_Y = [0, 0, 1, -1, 0, 0];
const FACE_DIR_Z = [0, 0, 0, 0, 1, -1];

const CORNER_X = [
  1, 1, 1, 1,
  0, 0, 0, 0,
  0, 1, 0, 1,
  0, 1, 0, 1,
  0, 1, 0, 1,
  1, 0, 1, 0,
];
const CORNER_Y = [
  0, 0, 1, 1,
  0, 0, 1, 1,
  1, 1, 1, 1,
  0, 0, 0, 0,
  0, 0, 1, 1,
  0, 0, 1, 1,
];
const CORNER_Z = [
  1, 0, 1, 0,
  0, 1, 0, 1,
  1, 1, 0, 0,
  0, 0, 1, 1,
  1, 1, 1, 1,
  0, 0, 0, 0,
];
const CORNER_U = [0, 1, 0, 1];
const CORNER_V = [0, 0, 1, 1];

export class MeshBuffer {
  positions: Float64Array;
  normals: Float64Array;
  uvs: Float64Array;
  indices: Int32Array;
  vertexCount: number;
  indexCount: number;
  capacity: number;
  indexCapacity: number;

  constructor(capacity: number) {
    this.positions = new Float64Array(capacity * 3);
    this.normals = new Float64Array(capacity * 3);
    this.uvs = new Float64Array(capacity * 2);
    this.indices = new Int32Array(capacity * 2);
    this.vertexCount = 0;
    this.indexCount = 0;
    this.capacity = capacity;
    this.indexCapacity = capacity * 2;
  }

  reset(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  private growVertices(): void {
    const next = this.capacity * 2;
    const positions = new Float64Array(next * 3);
    const normals = new Float64Array(next * 3);
    const uvs = new Float64Array(next * 2);
    for (let i = 0; i < this.vertexCount * 3; i++) {
      positions[i] = this.positions[i];
      normals[i] = this.normals[i];
    }
    for (let i = 0; i < this.vertexCount * 2; i++) uvs[i] = this.uvs[i];
    this.positions = positions;
    this.normals = normals;
    this.uvs = uvs;
    this.capacity = next;
  }

  private growIndices(): void {
    const next = this.indexCapacity * 2;
    const indices = new Int32Array(next);
    for (let i = 0; i < this.indexCount; i++) indices[i] = this.indices[i];
    this.indices = indices;
    this.indexCapacity = next;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): void {
    while (this.vertexCount + 1 > this.capacity) this.growVertices();
    const p = this.vertexCount * 3;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.normals[p] = nx;
    this.normals[p + 1] = ny;
    this.normals[p + 2] = nz;
    const t = this.vertexCount * 2;
    this.uvs[t] = u;
    this.uvs[t + 1] = v;
    this.vertexCount = this.vertexCount + 1;
  }

  index(value: number): void {
    while (this.indexCount + 1 > this.indexCapacity) this.growIndices();
    this.indices[this.indexCount] = value;
    this.indexCount = this.indexCount + 1;
  }
}

export function chunkOf(value: number): number {
  return Math.floor((value + WORLD_HALF) / CHUNK_SIZE) * CHUNK_SIZE - WORLD_HALF;
}

export function buildChunkMesh(world: World, cx: number, cz: number, out: MeshBuffer): void {
  out.reset();
  for (let x = cx; x < cx + CHUNK_SIZE; x++) {
    for (let z = cz; z < cz + CHUNK_SIZE; z++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = world.getBlock(x, y, z);
        if (block === 0) continue;
        for (let face = 0; face < 6; face++) {
          const neighbor = world.getBlock(x + FACE_DIR_X[face], y + FACE_DIR_Y[face], z + FACE_DIR_Z[face]);
          if (neighbor !== 0) continue;
          if (y === 0 && face === 3) continue;
          const tile = tileForBlock(block, face);
          const base = out.vertexCount;
          const uPad = 0.5 / (ATLAS_COLS * TILE_PX);
          const vPad = 0.5 / TILE_PX;
          for (let corner = 0; corner < 4; corner++) {
            const u = (tile + CORNER_U[corner]) / ATLAS_COLS + (CORNER_U[corner] === 0 ? uPad : -uPad);
            const v = CORNER_V[corner] === 0 ? 1 - vPad : vPad;
            out.vertex(
              x + CORNER_X[face * 4 + corner],
              y + CORNER_Y[face * 4 + corner],
              z + CORNER_Z[face * 4 + corner],
              FACE_DIR_X[face],
              FACE_DIR_Y[face],
              FACE_DIR_Z[face],
              u,
              v,
            );
          }
          out.index(base);
          out.index(base + 1);
          out.index(base + 2);
          out.index(base + 2);
          out.index(base + 1);
          out.index(base + 3);
        }
      }
    }
  }
}
