import { EYE_HEIGHT, WORLD_HEIGHT, World } from './world';

export class PlayerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  velocityY: number;
  grounded: boolean;
  flying: boolean;

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = 0;
    this.pitch = -0.15;
    this.velocityY = 0;
    this.grounded = false;
    this.flying = false;
  }
}

export class MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
  sprint: boolean;

  constructor() {
    this.forward = false;
    this.back = false;
    this.left = false;
    this.right = false;
    this.jump = false;
    this.down = false;
    this.sprint = false;
  }

  clear(): void {
    this.forward = false;
    this.back = false;
    this.left = false;
    this.right = false;
    this.jump = false;
    this.down = false;
    this.sprint = false;
  }
}

export class HitResult {
  found: boolean;
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;

  constructor() {
    this.found = false;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.prevZ = 0;
  }
}

export function lookDelta(state: PlayerState, dx: number, dy: number, sensitivity: number, invertY: boolean): void {
  state.yaw = state.yaw - dx * sensitivity;
  const flip = invertY ? -1 : 1;
  let pitch = state.pitch - dy * sensitivity * flip;
  if (pitch < -1.54) pitch = -1.54;
  if (pitch > 1.54) pitch = 1.54;
  state.pitch = pitch;
}

function collides(world: World, x: number, y: number, z: number): boolean {
  for (let bx = Math.floor(x - 0.25); bx <= Math.floor(x + 0.25); bx++) {
    for (let bz = Math.floor(z - 0.25); bz <= Math.floor(z + 0.25); bz++) {
      for (let by = Math.floor(y - EYE_HEIGHT + 0.02); by <= Math.floor(y + 0.1); by++) {
        if (world.getBlock(bx, by, bz) !== 0) return true;
      }
    }
  }
  return false;
}

export function movePlayer(world: World, state: PlayerState, input: MoveInput, dt: number): void {
  const speed = (input.sprint ? 8 : 4.5) * (state.flying ? 1.8 : 1);
  let forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  let right = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const length = Math.sqrt(forward * forward + right * right);
  if (length > 0) {
    forward = forward / length;
    right = right / length;
  }
  const dx = (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * right) * speed * dt;
  const dz = (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * right) * speed * dt;
  if (!collides(world, state.x + dx, state.y, state.z)) {
    state.x = state.x + dx;
  } else if (!state.flying && state.grounded && !collides(world, state.x + dx, state.y + 1.01, state.z)) {
    state.x = state.x + dx;
    state.y = state.y + 1.01;
  }
  if (!collides(world, state.x, state.y, state.z + dz)) {
    state.z = state.z + dz;
  } else if (!state.flying && state.grounded && !collides(world, state.x, state.y + 1.01, state.z + dz)) {
    state.z = state.z + dz;
    state.y = state.y + 1.01;
  }
  if (state.flying) {
    const dy = ((input.jump ? 1 : 0) - (input.down ? 1 : 0)) * speed * dt;
    if (!collides(world, state.x, state.y + dy, state.z)) {
      let next = state.y + dy;
      if (next > WORLD_HEIGHT + 10) next = WORLD_HEIGHT + 10;
      state.y = next;
    }
  } else {
    if (input.jump && state.grounded) {
      state.velocityY = 7.3;
      state.grounded = false;
    }
    state.velocityY = state.velocityY - 22 * dt;
    const nextY = state.y + state.velocityY * dt;
    if (!collides(world, state.x, nextY, state.z)) {
      state.y = nextY;
      state.grounded = false;
    } else {
      state.grounded = state.velocityY < 0;
      state.velocityY = 0;
    }
  }
  if (state.y < -10) {
    state.y = WORLD_HEIGHT;
    state.velocityY = 0;
  }
}

export function raycast(world: World, state: PlayerState, range: number, step: number, out: HitResult): void {
  const cosPitch = Math.cos(state.pitch);
  const dirX = -Math.sin(state.yaw) * cosPitch;
  const dirY = Math.sin(state.pitch);
  const dirZ = -Math.cos(state.yaw) * cosPitch;
  let prevX = Math.floor(state.x);
  let prevY = Math.floor(state.y);
  let prevZ = Math.floor(state.z);
  out.found = false;
  for (let distance = 0; distance < range; distance += step) {
    const x = Math.floor(state.x + dirX * distance);
    const y = Math.floor(state.y + dirY * distance);
    const z = Math.floor(state.z + dirZ * distance);
    if (world.getBlock(x, y, z) !== 0) {
      out.found = true;
      out.x = x;
      out.y = y;
      out.z = z;
      out.prevX = prevX;
      out.prevY = prevY;
      out.prevZ = prevZ;
      return;
    }
    prevX = x;
    prevY = y;
    prevZ = z;
  }
}

export function overlapsPlayer(state: PlayerState, x: number, y: number, z: number): boolean {
  return x + 1 > state.x - 0.25 && x < state.x + 0.25 && z + 1 > state.z - 0.25 && z < state.z + 0.25 && y + 1 > state.y - EYE_HEIGHT && y < state.y + 0.1;
}
