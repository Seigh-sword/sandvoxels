import { Rnd } from './noise';
import { World } from './world';

export const MOB_NONE = 0;
export const MOB_RABBIT = 1;
export const MOB_DEER = 2;
export const MOB_SHADE = 3;
export const MOB_MAX = 24;

export function mobHp(kind: number): number {
  if (kind === MOB_RABBIT) return 6;
  if (kind === MOB_DEER) return 10;
  return 14;
}

export function mobSpeed(kind: number): number {
  if (kind === MOB_RABBIT) return 2.4;
  if (kind === MOB_DEER) return 3.0;
  return 3.4;
}

export function mobWander(kind: number): number {
  if (kind === MOB_RABBIT) return 3.0;
  if (kind === MOB_DEER) return 3.5;
  return 2.0;
}

export class MobSystem {
  rnd: Rnd;
  count: number;
  active: Uint8Array;
  kind: Uint8Array;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  vy: Float64Array;
  yaw: Float64Array;
  hp: Int32Array;
  timer: Float64Array;
  hurt: Float64Array;
  attackTimer: Float64Array;
  drops: number;

  constructor() {
    this.rnd = new Rnd();
    this.count = 0;
    this.active = new Uint8Array(MOB_MAX);
    this.kind = new Uint8Array(MOB_MAX);
    this.px = new Float64Array(MOB_MAX);
    this.py = new Float64Array(MOB_MAX);
    this.pz = new Float64Array(MOB_MAX);
    this.vy = new Float64Array(MOB_MAX);
    this.yaw = new Float64Array(MOB_MAX);
    this.hp = new Int32Array(MOB_MAX);
    this.timer = new Float64Array(MOB_MAX);
    this.hurt = new Float64Array(MOB_MAX);
    this.attackTimer = new Float64Array(MOB_MAX);
    this.drops = 0;
  }

  aliveCount(): number {
    let total = 0;
    for (let i = 0; i < MOB_MAX; i++) if (this.active[i]) total = total + 1;
    return total;
  }

  spawn(world: World, x: number, _y: number, z: number, night: boolean): void {
    const cap = night ? 10 : 7;
    if (this.aliveCount() >= cap) return;
    const angle = this.rnd.next() * Math.PI * 2;
    const dist = 10 + this.rnd.next() * 14;
    const sx = Math.floor(x + Math.sin(angle) * dist);
    const sz = Math.floor(z + Math.cos(angle) * dist);
    const sy = world.surface(sx, sz) + 1;
    if (sy < 4) return;
    const roll = this.rnd.next();
    let mobKind = MOB_RABBIT;
    if (night) {
      if (roll < 0.45) mobKind = MOB_SHADE;
      else if (roll < 0.72) mobKind = MOB_DEER;
      else mobKind = MOB_RABBIT;
    } else {
      mobKind = roll < 0.55 ? MOB_RABBIT : MOB_DEER;
    }
    let index = -1;
    for (let i = 0; i < MOB_MAX; i++) {
      if (!this.active[i]) { index = i; break; }
    }
    if (index < 0) return;
    this.active[index] = 1;
    this.kind[index] = mobKind;
    this.px[index] = sx + 0.5;
    this.py[index] = sy;
    this.pz[index] = sz + 0.5;
    this.vy[index] = 0;
    this.yaw[index] = this.rnd.next() * Math.PI * 2;
    this.hp[index] = mobHp(mobKind);
    this.timer[index] = this.rnd.next() * mobWander(mobKind);
    this.hurt[index] = 0;
    this.attackTimer[index] = 0;
  }

  damageAt(index: number, amount: number): void {
    if (!this.active[index]) return;
    this.hp[index] = this.hp[index] - amount;
    this.hurt[index] = 0.25;
    if (this.hp[index] <= 0) {
      this.drops = this.drops + mobDropFood(this.kind[index]);
      this.active[index] = 0;
    }
  }

  attackRay(x: number, y: number, z: number, dx: number, dy: number, dz: number, amount: number): number {
    let hits = 0;
    for (let i = 0; i < MOB_MAX; i++) {
      if (!this.active[i]) continue;
      const vx = this.px[i] - x;
      const vy = this.py[i] + 0.4 - y;
      const vz = this.pz[i] - z;
      const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (dist > 3.5) continue;
      const dot = (vx * dx + vy * dy + vz * dz) / dist;
      if (dot < 0.75) continue;
      this.damageAt(i, amount);
      hits = hits + 1;
    }
    return hits;
  }

  update(world: World, dt: number, playerX: number, playerZ: number, night: boolean): number {
    let playerDamage = 0;
    for (let i = 0; i < MOB_MAX; i++) {
      if (!this.active[i]) continue;
      if (this.hurt[i] > 0) this.hurt[i] = this.hurt[i] - dt;
      const dxp = playerX - this.px[i];
      const dzp = playerZ - this.pz[i];
      const distSq = dxp * dxp + dzp * dzp;
      if (distSq > 60 * 60) {
        this.active[i] = 0;
        continue;
      }
      const mobKind = this.kind[i];
      if (mobKind === MOB_SHADE && !night) {
        this.hp[i] = this.hp[i] - Math.ceil(dt * 4);
        if (this.hp[i] <= 0) {
          this.active[i] = 0;
          continue;
        }
      }
      let speed = mobSpeed(mobKind);
      if (mobKind === MOB_SHADE && distSq < 18 * 18) {
        this.yaw[i] = Math.atan2(dxp, dzp);
      } else {
        this.timer[i] = this.timer[i] - dt;
        if (this.timer[i] <= 0) {
          this.timer[i] = mobWander(mobKind) * (0.5 + this.rnd.next());
          this.yaw[i] = this.rnd.next() * Math.PI * 2;
        }
        if (mobKind === MOB_SHADE) speed = speed * 0.5;
      }
      const moveX = Math.sin(this.yaw[i]) * speed * dt;
      const moveZ = Math.cos(this.yaw[i]) * speed * dt;
      const feet = Math.floor(this.py[i]);
      const nextX = Math.floor(this.px[i] + moveX);
      const nextZ = Math.floor(this.pz[i] + moveZ);
      if (world.getBlock(nextX, feet, nextZ) === 0 || mobKind === MOB_SHADE) {
        this.px[i] = this.px[i] + moveX;
        this.pz[i] = this.pz[i] + moveZ;
      } else if (world.getBlock(nextX, feet + 1, nextZ) === 0) {
        this.vy[i] = 7;
      } else {
        this.yaw[i] = this.yaw[i] + 1.7;
      }
      this.vy[i] = this.vy[i] - 22 * dt;
      this.py[i] = this.py[i] + this.vy[i] * dt;
      const groundY = world.surface(Math.floor(this.px[i]), Math.floor(this.pz[i])) + 1;
      if (this.py[i] <= groundY) {
        this.py[i] = groundY;
        this.vy[i] = 0;
      }
      if (mobKind === MOB_SHADE && distSq < 1.6 * 1.6) {
        this.attackTimer[i] = this.attackTimer[i] - dt;
        if (this.attackTimer[i] <= 0) {
          this.attackTimer[i] = 1.1;
          playerDamage = playerDamage + 2;
        }
      }
    }
    return playerDamage;
  }
}

export function mobDropFood(kind: number): number {
  if (kind === MOB_RABBIT) return 3;
  if (kind === MOB_DEER) return 6;
  return 0;
}
