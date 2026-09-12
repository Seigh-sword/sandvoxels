export function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  const positive = h < 0 ? h + 4294967296 : h;
  return positive / 4294967296;
}

export class Rnd {
  counter: number;

  constructor() {
    this.counter = 0;
  }

  next(): number {
    this.counter = this.counter + 1;
    return hash2(this.counter, 7777, 1234567);
  }
}
