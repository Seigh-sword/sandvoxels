import * as THREE from 'three';
import {
  ATLAS_PX, TILE_PX, blockSideColor, blockTopColor, renderAtlas, BLOCK_LEAVES, BLOCK_MUSHROOM,
} from '../core/palette';
import { MeshBuffer, buildChunkMesh, chunkOf } from '../core/mesh';
import { HitResult, MoveInput, PlayerState, lookDelta, movePlayer, overlapsPlayer, raycast } from '../core/player';
import {
  BIOME_ALPINE, BIOME_TUNDRA, CHUNK_SIZE, EYE_HEIGHT, MODE_CREATIVE, SEA_BLOCK, WATER_Y, WORLD_HEIGHT, World,
  biomeAt, biomeSky, biomeWater,
} from '../core/world';
import { TimeState, WeatherState, WEATHER_RAIN, WEATHER_SNOW, WEATHER_STORM } from '../core/time';
import { MOB_DEER, MOB_MAX, MOB_RABBIT, MOB_SHADE, MobSystem } from '../core/mobs';
import { Survival } from '../core/survival';

export interface EngineSettings {
  quality: 'Performance' | 'Balanced' | 'High';
  fov: number;
  sensitivity: number;
  sound: boolean;
  volume: number;
  invertY: boolean;
}

export interface GameStats {
  fps: number;
  x: number;
  y: number;
  z: number;
  flying: boolean;
  target: string;
  changed: number;
  health: number;
  hunger: number;
  thirst: number;
  air: number;
  dead: boolean;
  clock: string;
  day: number;
  weather: number;
  biome: string;
  night: boolean;
  underwater: boolean;
  hurt: boolean;
  explorer: boolean;
}

export interface SavedWorld {
  version?: number;
  keys?: number[];
  values?: number[];
  editsXZ?: number[];
  editsY?: number[];
  editsV?: number[];
  position?: number[];
  rotation?: number[];
  flying?: boolean;
  hour?: number;
  day?: number;
  weather?: number;
  weatherTimer?: number;
  health?: number;
  hunger?: number;
  thirst?: number;
}

export const BLOCK_NAMES = [
  'Grass', 'Dirt', 'Stone', 'Oak log', 'Leaves', 'Sand', 'Snow', 'Oak planks', 'Brick',
  'Cactus', 'Mushroom', 'Ice', 'Mud', 'Savanna grass',
];

export const BIOME_LABELS = ['Forest', 'Plains', 'Desert', 'Alpine', 'Tundra', 'Swamp', 'Savanna', 'Badlands', 'Jungle'];
export const WEATHER_LABELS = ['Clear', 'Rain', 'Snow', 'Storm'];

const CHUNK_RADIUS = 3;
const NIGHT_SKY = 0x0b1026;

export function blockColors(id: number): { top: string; side: string } {
  const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
  return { top: hex(blockTopColor(id)), side: hex(blockSideColor(id)) };
}

const PIXEL_SCALE: Record<string, number> = { Performance: 0.34, Balanced: 0.5, High: 0.72 };

function makeAtlasTexture(): THREE.DataTexture {
  const pixels = new Uint8Array(ATLAS_PX * TILE_PX * 4);
  renderAtlas(pixels);
  const texture = new THREE.DataTexture(pixels, ATLAS_PX, TILE_PX, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class VoxelEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  player: PlayerState;
  input = new MoveInput();
  hit = new HitResult();
  time = new TimeState(9);
  weather = new WeatherState();
  mobs = new MobSystem();
  survival = new Survival();
  settings: EngineSettings;
  selected = 1;
  paused = true;
  changed = 0;
  keys = new Set<string>();
  onAutoSave: (() => void) | null = null;
  onToast: ((text: string) => void) | null = null;
  private chunks = new Map<string, THREE.Mesh>();
  private buildQueue: string[] = [];
  private windowCX = 0;
  private windowCZ = 0;
  private buffer = new MeshBuffer(16384);
  private material: THREE.MeshLambertMaterial;
  private outline: THREE.LineSegments;
  private container: HTMLDivElement;
  private raf = 0;
  private previousTime = 0;
  private fpsTime = 0;
  private frames = 0;
  private saveTime = 0;
  private audio: AudioContext | null = null;
  private observer: ResizeObserver;
  private disposeList: (() => void)[] = [];
  private onStats: (stats: GameStats) => void;
  private spawnX = 0.5;
  private spawnY = 20;
  private spawnZ = 0.5;
  private hemi: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private moonLight: THREE.DirectionalLight;
  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;
  private stars!: THREE.Points;
  private rain!: THREE.Points;
  private rainPos!: Float32Array;
  private rainSeed!: Float32Array;
  private water!: THREE.Mesh;
  private waterMaterial!: THREE.MeshPhongMaterial;
  private clouds = new THREE.Group();
  private mobGroups: (THREE.Group | null)[] = [];
  private mobKinds: number[] = [];
  private mobMats: THREE.MeshLambertMaterial[][] = [];
  private eatTimer = 0;
  private drinkTimer = 0;
  private mobSpawnTimer = 3;
  private fallPeak = 0;
  private wasGrounded = true;
  private skyColor = new THREE.Color(0xb0d5df);
  private nightColor = new THREE.Color(NIGHT_SKY);
  private flashColor = new THREE.Color(0xf4f6ff);

  constructor(container: HTMLDivElement, seed: number, biome: number, mode: number, settings: EngineSettings, onStats: (stats: GameStats) => void) {
    this.container = container;
    this.settings = settings;
    this.onStats = onStats;
    this.world = new World(seed, biome, mode);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = settings.quality === 'High';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0xb0d5df, settings.quality === 'Performance' ? 24 : 38, 92);
    this.hemi = new THREE.HemisphereLight(0xe8f5ff, 0x77724a, 2.3);
    this.scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xfff1c9, 2.1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -45;
    this.sunLight.shadow.camera.right = 45;
    this.sunLight.shadow.camera.top = 45;
    this.sunLight.shadow.camera.bottom = -45;
    this.sunLight.shadow.camera.far = 220;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.moonLight = new THREE.DirectionalLight(0x8fa8d8, 0);
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);
    this.material = new THREE.MeshLambertMaterial({ map: makeAtlasTexture() });
    const spawn = this.findSpawn();
    this.spawnX = spawn.x;
    this.spawnY = spawn.y;
    this.spawnZ = spawn.z;
    this.player = new PlayerState(spawn.x, spawn.y, spawn.z);
    this.fallPeak = spawn.y;
    this.buildChunk(chunkOf(spawn.x), chunkOf(spawn.z));
    this.updateWindow(true);
    this.addScenery();
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.007, 1.007, 1.007)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    for (let i = 0; i < MOB_MAX; i++) {
      this.mobGroups.push(null);
      this.mobKinds.push(0);
      this.mobMats.push([]);
    }
    container.appendChild(this.renderer.domElement);
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.previousTime = performance.now();
    this.fpsTime = this.previousTime;
    this.saveTime = this.previousTime;
    this.raf = requestAnimationFrame(this.tick);
  }

  private findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r <= 40; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const s = this.world.surface(dx, dz);
          if (s >= SEA_BLOCK && s < WORLD_HEIGHT - 10) {
            return { x: dx + 0.5, y: s + EYE_HEIGHT + 1.05, z: dz + 0.5 };
          }
        }
      }
    }
    const s = this.world.surface(0, 0);
    return { x: 0.5, y: s + EYE_HEIGHT + 1.05, z: 0.5 };
  }

  loadSave(save: SavedWorld | null): void {
    if (!save) return;
    if (save.version === 2 && save.editsXZ && save.editsY && save.editsV) {
      const count = Math.min(save.editsXZ.length, save.editsY.length, save.editsV.length);
      this.world.applySavedEdits(new Int32Array(save.editsXZ), new Uint8Array(save.editsY), new Uint8Array(save.editsV), count);
      this.changed = count;
      if (typeof save.hour === 'number') this.time.hour = save.hour;
      if (typeof save.day === 'number') this.time.day = save.day;
      if (typeof save.weather === 'number') this.weather.weather = save.weather;
      if (typeof save.weatherTimer === 'number') this.weather.timer = save.weatherTimer;
      if (this.world.mode !== MODE_CREATIVE) {
        if (typeof save.health === 'number') this.survival.health = Math.max(1, save.health);
        if (typeof save.hunger === 'number') this.survival.hunger = save.hunger;
        if (typeof save.thirst === 'number') this.survival.thirst = save.thirst;
      }
    } else if (save.keys && save.values) {
      const count = Math.min(save.keys.length, save.values.length);
      const xz = new Int32Array(count);
      const ys = new Uint8Array(count);
      const values = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        const key = save.keys[i];
        const y = Math.floor(key / 6400);
        const rest = key - y * 6400;
        const z = Math.floor(rest / 80) - 40;
        const x = rest - (z + 40) * 80 - 40;
        xz[i] = (x + 4096) * 8192 + (z + 4096);
        ys[i] = y;
        values[i] = save.values[i];
      }
      this.world.applySavedEdits(xz, ys, values, count);
      this.changed = count;
    }
    if (save.position && save.position.length === 3 && save.position.every(Number.isFinite)) {
      this.player.x = save.position[0];
      this.player.y = save.position[1];
      this.player.z = save.position[2];
      this.fallPeak = save.position[1];
      this.updateWindow(true);
    }
    if (save.rotation && save.rotation.length === 2 && save.rotation.every(Number.isFinite)) {
      this.player.yaw = save.rotation[0];
      this.player.pitch = save.rotation[1];
    }
    if (this.world.mode === MODE_CREATIVE) this.player.flying = !!save.flying;
    this.chunks.forEach((_mesh, key) => {
      const parts = key.split(',');
      this.buildChunk(Number(parts[0]), Number(parts[1]));
    });
    this.syncCamera();
  }

  private syncCamera(): void {
    this.camera.position.set(this.player.x, this.player.y, this.player.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    const scale = PIXEL_SCALE[this.settings.quality] ?? 0.5;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)), false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  }

  applySettings(settings: EngineSettings): void {
    const qualityChanged = settings.quality !== this.settings.quality;
    this.settings = settings;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    if (qualityChanged) {
      this.renderer.shadowMap.enabled = settings.quality === 'High';
      this.resize();
    }
  }

  private buildChunk(cx: number, cz: number): void {
    buildChunkMesh(this.world, cx, cz, this.buffer);
    const key = `${cx},${cz}`;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.buffer.positions.subarray(0, this.buffer.vertexCount * 3), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.buffer.normals.subarray(0, this.buffer.vertexCount * 3), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.buffer.uvs.subarray(0, this.buffer.vertexCount * 2), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.buffer.indices.subarray(0, this.buffer.indexCount)), 1));
    geometry.computeBoundingSphere();
    const old = this.chunks.get(key);
    if (old) {
      old.geometry.dispose();
      old.geometry = geometry;
    } else {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.castShadow = this.settings.quality === 'High';
      mesh.receiveShadow = this.settings.quality === 'High';
      this.scene.add(mesh);
      this.chunks.set(key, mesh);
    }
  }

  private updateWindow(force: boolean): void {
    const pcx = chunkOf(this.player.x);
    const pcz = chunkOf(this.player.z);
    if (!force && pcx === this.windowCX && pcz === this.windowCZ) return;
    this.windowCX = pcx;
    this.windowCZ = pcz;
    const pending: { key: string; dist: number }[] = [];
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        if (this.chunks.has(key) || this.buildQueue.indexOf(key) >= 0) continue;
        pending.push({ key, dist: dx * dx + dz * dz });
      }
    }
    pending.sort((a, b) => a.dist - b.dist);
    for (const item of pending) this.buildQueue.push(item.key);
    this.chunks.forEach((mesh, key) => {
      const parts = key.split(',');
      const cx = Number(parts[0]);
      const cz = Number(parts[1]);
      if (Math.abs(cx - pcx) <= CHUNK_RADIUS + 1 && Math.abs(cz - pcz) <= CHUNK_RADIUS + 1) return;
      mesh.geometry.dispose();
      this.scene.remove(mesh);
      this.chunks.delete(key);
    });
  }

  private processQueue(): void {
    let budget = 2;
    while (budget > 0 && this.buildQueue.length > 0) {
      const key = this.buildQueue.shift() as string;
      const parts = key.split(',');
      const cx = Number(parts[0]);
      const cz = Number(parts[1]);
      if (Math.abs(cx - this.windowCX) > CHUNK_RADIUS || Math.abs(cz - this.windowCZ) > CHUNK_RADIUS) continue;
      if (this.chunks.has(key)) continue;
      this.buildChunk(cx, cz);
      budget--;
    }
  }

  private rebuildAt(x: number, z: number): void {
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx !== 0 && !(dx < 0 && lx === 0) && !(dx > 0 && lx === CHUNK_SIZE - 1)) continue;
        if (dz !== 0 && !(dz < 0 && lz === 0) && !(dz > 0 && lz === CHUNK_SIZE - 1)) continue;
        const key = `${cx + dx},${cz + dz}`;
        if (this.chunks.has(key)) this.buildChunk(cx + dx, cz + dz);
      }
    }
  }

  private addScenery(): void {
    const waterGeometry = new THREE.PlaneGeometry(280, 280);
    this.waterMaterial = new THREE.MeshPhongMaterial({
      color: 0x489fb8,
      transparent: true,
      opacity: 0.72,
      shininess: 70,
      side: THREE.DoubleSide,
    });
    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.scene.add(this.water);
    this.disposeList.push(() => { waterGeometry.dispose(); this.waterMaterial.dispose(); });

    const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xfffcf1, transparent: true, opacity: 0.9, fog: false });
    for (let i = 0; i < 26; i++) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      const rx = (Math.sin(i * 127.1 + 311.7 + this.world.seed * 0.013) * 43758.5453) % 1;
      const ry = (Math.sin(i * 127.1 + 2 * 311.7 + 8 * 0.013) * 43758.5453) % 1;
      const rz = (Math.sin(i * 127.1 + 3 * 311.7 + 9 * 0.013) * 43758.5453) % 1;
      const rs = (Math.sin(i * 127.1 + 4 * 311.7 + 6 * 0.013) * 43758.5453) % 1;
      cloud.position.set(Math.abs(rx) * 220 - 110, 34 + Math.abs(ry) * 10, Math.abs(rz) * 220 - 110);
      cloud.scale.set(5 + Math.abs(rs) * 12, 1.3 + Math.abs(ry) * 2, 3 + Math.abs(rx) * 6);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    this.disposeList.push(() => { cloudGeometry.dispose(); cloudMaterial.dispose(); });

    const sunGeometry = new THREE.SphereGeometry(7, 10, 10);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.scene.add(this.sunMesh);
    const moonGeometry = new THREE.SphereGeometry(4.5, 10, 10);
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe8f5, fog: false });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.scene.add(this.moonMesh);
    this.disposeList.push(() => { sunGeometry.dispose(); sunMaterial.dispose(); moonGeometry.dispose(); moonMaterial.dispose(); });

    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.9 + 0.05);
      starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * 220;
      starPos[i * 3 + 1] = Math.cos(phi) * 220;
      starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 220;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xf4f8ff, size: 1.4, transparent: true, opacity: 0, fog: false, sizeAttenuation: true });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.stars);
    this.disposeList.push(() => { starGeometry.dispose(); starMaterial.dispose(); });

    const rainCount = 900;
    this.rainPos = new Float32Array(rainCount * 3);
    this.rainSeed = new Float32Array(rainCount);
    for (let i = 0; i < rainCount; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 34;
      this.rainPos[i * 3 + 1] = Math.random() * 26 - 8;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 34;
      this.rainSeed[i] = Math.random() * 10;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const rainMaterial = new THREE.PointsMaterial({ color: 0x9fc4d8, size: 0.1, transparent: true, opacity: 0, fog: false });
    this.rain = new THREE.Points(rainGeometry, rainMaterial);
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.disposeList.push(() => { rainGeometry.dispose(); rainMaterial.dispose(); });
  }

  look(dx: number, dy: number): void {
    if (this.paused) return;
    const sensitivity = 0.0007 + this.settings.sensitivity * 0.000033;
    lookDelta(this.player, dx, dy, sensitivity, this.settings.invertY);
    this.syncCamera();
  }

  toggleFly(): void {
    if (this.world.mode !== MODE_CREATIVE) return;
    this.player.flying = !this.player.flying;
    this.player.velocityY = 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.keys.clear();
    this.input.clear();
  }

  respawn(): void {
    this.survival.reset();
    this.player.x = this.spawnX;
    this.player.y = this.spawnY;
    this.player.z = this.spawnZ;
    this.player.velocityY = 0;
    this.player.flying = false;
    this.fallPeak = this.spawnY;
    this.updateWindow(true);
    this.syncCamera();
  }

  eat(): void {
    if (this.world.mode === MODE_CREATIVE || this.survival.dead) return;
    if (this.eatTimer > 0) return;
    this.eatTimer = 1.4;
    const bx = Math.floor(this.player.x);
    const by = Math.floor(this.player.y - EYE_HEIGHT);
    const bz = Math.floor(this.player.z);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -1; dy <= 3; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const block = this.world.getBlock(bx + dx, by + dy, bz + dz);
          if (block === BLOCK_MUSHROOM) {
            this.survival.eat(5);
            this.toast('Picked a mushroom (+5 food)');
            return;
          }
          if (block === BLOCK_LEAVES) {
            this.survival.eat(4);
            this.toast('Foraged some berries (+4 food)');
            return;
          }
        }
      }
    }
    this.toast('Nothing edible nearby');
  }

  drink(): void {
    if (this.world.mode === MODE_CREATIVE || this.survival.dead) return;
    if (this.drinkTimer > 0) return;
    this.drinkTimer = 1;
    const inWater = this.player.y - EYE_HEIGHT < WATER_Y;
    if (inWater || this.weather.precipitating()) {
      this.survival.drink(8);
      this.toast(inWater ? 'Drank from the water (+8 water)' : 'Drank the rainfall (+8 water)');
    } else {
      this.toast('No water nearby');
    }
  }

  private toast(text: string): void {
    if (this.onToast) this.onToast(text);
  }

  act(place: boolean): void {
    if (this.paused || this.survival.dead) return;
    const cosPitch = Math.cos(this.player.pitch);
    const dirX = -Math.sin(this.player.yaw) * cosPitch;
    const dirY = Math.sin(this.player.pitch);
    const dirZ = -Math.cos(this.player.yaw) * cosPitch;
    if (!place) {
      const hits = this.mobs.attackRay(this.player.x, this.player.y - EYE_HEIGHT * 0.5, this.player.z, dirX, dirY, dirZ, 3);
      if (hits > 0) {
        this.playSound(false);
        this.collectDrops();
        return;
      }
    }
    raycast(this.world, this.player, 8, 0.045, this.hit);
    if (!this.hit.found) return;
    let x = this.hit.x;
    let y = this.hit.y;
    let z = this.hit.z;
    if (place) {
      x = this.hit.prevX;
      y = this.hit.prevY;
      z = this.hit.prevZ;
    }
    if (y < 1 || y >= WORLD_HEIGHT) return;
    if (place && overlapsPlayer(this.player, x, y, z)) return;
    this.world.edit(x, y, z, place ? this.selected : 0);
    this.changed++;
    this.rebuildAt(x, z);
    this.playSound(place);
  }

  private collectDrops(): void {
    if (this.mobs.drops <= 0) return;
    const amount = this.mobs.drops;
    this.mobs.drops = 0;
    if (this.world.mode !== MODE_CREATIVE) {
      this.survival.eat(amount);
      this.toast(`Gathered food (+${amount})`);
    } else {
      this.toast('Mob defeated');
    }
  }

  private playSound(place: boolean): void {
    if (!this.settings.sound) return;
    try {
      if (!this.audio) this.audio = new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(place ? 220 : 110, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(45, this.audio.currentTime + 0.08);
      gain.gain.setValueAtTime(this.settings.volume / 500, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.1);
      oscillator.connect(gain);
      gain.connect(this.audio.destination);
      oscillator.start();
      oscillator.stop(this.audio.currentTime + 0.11);
    } catch {
      return;
    }
  }

  private playThunder(): void {
    if (!this.settings.sound) return;
    try {
      if (!this.audio) this.audio = new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(70, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(28, this.audio.currentTime + 0.7);
      gain.gain.setValueAtTime(this.settings.volume / 320, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.8);
      oscillator.connect(gain);
      gain.connect(this.audio.destination);
      oscillator.start();
      oscillator.stop(this.audio.currentTime + 0.85);
    } catch {
      return;
    }
  }

  exportSave(): SavedWorld {
    const editsXZ: number[] = [];
    const editsY: number[] = [];
    const editsV: number[] = [];
    for (let i = 0; i < this.world.editCount; i++) {
      editsXZ.push(this.world.editXZ[i]);
      editsY.push(this.world.editY[i]);
      editsV.push(this.world.editValues[i]);
    }
    return {
      version: 2,
      editsXZ,
      editsY,
      editsV,
      position: [this.player.x, this.player.y, this.player.z],
      rotation: [this.player.yaw, this.player.pitch],
      flying: this.player.flying,
      hour: this.time.hour,
      day: this.time.day,
      weather: this.weather.weather,
      weatherTimer: this.weather.timer,
      health: this.survival.health,
      hunger: this.survival.hunger,
      thirst: this.survival.thirst,
    };
  }

  private syncMobs(): void {
    for (let i = 0; i < MOB_MAX; i++) {
      const active = this.mobs.active[i] === 1;
      const kind = this.mobs.kind[i];
      if (!active) {
        if (this.mobGroups[i]) this.mobGroups[i]!.visible = false;
        continue;
      }
      if (!this.mobGroups[i] || this.mobKinds[i] !== kind) {
        this.buildMobMesh(i, kind);
      }
      const group = this.mobGroups[i]!;
      group.visible = true;
      group.position.set(this.mobs.px[i], this.mobs.py[i], this.mobs.pz[i]);
      group.rotation.y = this.mobs.yaw[i];
      const hurt = this.mobs.hurt[i] > 0;
      for (const mat of this.mobMats[i]) mat.emissive.setHex(hurt ? 0x882222 : 0x000000);
    }
  }

  private buildMobMesh(index: number, kind: number): void {
    const old = this.mobGroups[index];
    if (old) {
      this.scene.remove(old);
      old.traverse(node => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      for (const mat of this.mobMats[index]) mat.dispose();
    }
    const group = new THREE.Group();
    const mats: THREE.MeshLambertMaterial[] = [];
    const add = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = this.settings.quality === 'High';
      mats.push(material);
      group.add(mesh);
      this.disposeList.push(() => geometry.dispose());
    };
    if (kind === MOB_RABBIT) {
      add(0.42, 0.38, 0.62, 0xc9a066, 0, 0.24, 0);
      add(0.3, 0.3, 0.3, 0xd8b27c, 0, 0.5, 0.34);
      add(0.08, 0.26, 0.08, 0xd8b27c, -0.09, 0.75, 0.32);
      add(0.08, 0.26, 0.08, 0xd8b27c, 0.09, 0.75, 0.32);
    } else if (kind === MOB_DEER) {
      add(0.62, 0.66, 1.2, 0x96663f, 0, 0.78, 0);
      add(0.32, 0.42, 0.46, 0xa87a4d, 0, 1.25, 0.72);
      add(0.1, 0.6, 0.1, 0x6e4a2c, -0.2, 0.3, 0.42);
      add(0.1, 0.6, 0.1, 0x6e4a2c, 0.2, 0.3, 0.42);
      add(0.1, 0.6, 0.1, 0x6e4a2c, -0.2, 0.3, -0.42);
      add(0.1, 0.6, 0.1, 0x6e4a2c, 0.2, 0.3, -0.42);
    } else if (kind === MOB_SHADE) {
      add(0.78, 1.4, 0.62, 0x241a38, 0, 0.8, 0);
      add(0.12, 0.1, 0.06, 0xff3355, -0.17, 1.28, 0.32);
      add(0.12, 0.1, 0.06, 0xff3355, 0.17, 1.28, 0.32);
    }
    this.mobGroups[index] = group;
    this.mobKinds[index] = kind;
    this.mobMats[index] = mats;
    this.scene.add(group);
  }

  private updateEnvironment(dt: number, now: number): void {
    this.time.advance(dt);
    const camBiome = biomeAt(this.world.biome, Math.floor(this.player.x), Math.floor(this.player.z), this.world.seed);
    const cold = camBiome === BIOME_TUNDRA || camBiome === BIOME_ALPINE;
    const flashBefore = this.weather.flash;
    this.weather.advance(dt, cold);
    if (this.weather.flash > flashBefore && this.weather.flash >= 1) this.playThunder();

    const daylight = this.time.daylight();
    const dim = this.weather.skyDim();
    const flash = this.weather.flash;
    const nightAmount = 1 - daylight;

    this.skyColor.setHex(biomeSky(camBiome));
    this.skyColor.lerp(this.nightColor, nightAmount * 0.92);
    this.skyColor.multiplyScalar(0.35 + 0.65 * dim);
    if (flash > 0) this.skyColor.lerp(this.flashColor, flash * 0.85);
    this.scene.background = this.skyColor;
    (this.renderer as THREE.WebGLRenderer).setClearColor(this.skyColor);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.skyColor);
    let fogFar = this.settings.quality === 'Performance' ? 70 : 92;
    if (this.weather.weather === WEATHER_RAIN) fogFar = 58;
    if (this.weather.weather === WEATHER_STORM) fogFar = 42;
    if (this.weather.weather === WEATHER_SNOW) fogFar = 64;
    fog.far = fogFar;
    fog.near = fogFar * 0.35;

    this.hemi.intensity = (0.3 + 2.0 * daylight) * dim + flash * 3;
    const sunDirX = this.time.sunDirX();
    const sunDirY = this.time.sunDirY();
    const sunDirZ = this.time.sunDirZ();
    this.sunLight.intensity = Math.max(0, sunDirY) * 2.2 * dim;
    this.sunLight.position.set(this.player.x + sunDirX * 80, this.player.y + Math.max(8, sunDirY * 80), this.player.z + sunDirZ * 80);
    this.sunLight.target.position.set(this.player.x, this.player.y, this.player.z);
    this.moonLight.intensity = nightAmount * 0.55 * dim;
    this.moonLight.position.set(this.player.x - sunDirX * 80, this.player.y + Math.max(8, -sunDirY * 80), this.player.z - sunDirZ * 80);
    this.moonLight.target.position.set(this.player.x, this.player.y, this.player.z);

    this.sunMesh.position.set(this.player.x + sunDirX * 240, this.player.y + sunDirY * 240, this.player.z + sunDirZ * 240);
    this.sunMesh.visible = sunDirY > -0.15;
    this.moonMesh.position.set(this.player.x - sunDirX * 240, this.player.y - sunDirY * 240, this.player.z - sunDirZ * 240);
    this.moonMesh.visible = sunDirY < 0.15;
    this.stars.position.set(this.player.x, this.player.y, this.player.z);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, nightAmount * 1.4 - 0.25) * dim;

    this.water.position.x = Math.round(this.player.x / 4) * 4;
    this.water.position.z = Math.round(this.player.z / 4) * 4;
    this.waterMaterial.color.setHex(biomeWater(camBiome));
    this.waterMaterial.color.lerp(this.nightColor, nightAmount * 0.75);
    this.waterMaterial.color.multiplyScalar(0.4 + 0.6 * dim);

    this.clouds.position.set(Math.round(this.player.x / 8) * 8 + Math.sin(now / 150000) * 10, 0, Math.round(this.player.z / 8) * 8);
    this.clouds.visible = daylight > 0.08;

    const raining = this.weather.weather === WEATHER_RAIN || this.weather.weather === WEATHER_STORM;
    const snowing = this.weather.weather === WEATHER_SNOW;
    this.rain.visible = raining || snowing;
    if (this.rain.visible) {
      const material = this.rain.material as THREE.PointsMaterial;
      material.size = snowing ? 0.24 : this.weather.weather === WEATHER_STORM ? 0.13 : 0.1;
      material.opacity = snowing ? 0.85 : 0.6;
      material.color.setHex(snowing ? 0xffffff : 0x9fc4d8);
      const speed = snowing ? 2.6 : this.weather.weather === WEATHER_STORM ? 24 : 17;
      const cx = this.player.x;
      const cy = this.player.y;
      const cz = this.player.z;
      for (let i = 0; i < this.rainSeed.length; i++) {
        this.rainPos[i * 3 + 1] -= speed * dt * (0.7 + (this.rainSeed[i] % 1) * 0.6);
        if (snowing) this.rainPos[i * 3] += Math.sin(now / 700 + this.rainSeed[i]) * dt * 0.8;
        if (this.rainPos[i * 3 + 1] < cy - 9) {
          this.rainPos[i * 3] = cx + (Math.random() - 0.5) * 34;
          this.rainPos[i * 3 + 1] = cy + 13 + Math.random() * 5;
          this.rainPos[i * 3 + 2] = cz + (Math.random() - 0.5) * 34;
        }
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.rain.position.set(0, 0, 0);
    }
  }

  private updateMobs(dt: number): void {
    const damage = this.mobs.update(this.world, dt, this.player.x, this.player.z, this.time.isNight());
    if (damage > 0 && this.world.mode !== MODE_CREATIVE && !this.survival.dead) {
      this.survival.damage(damage);
      this.toast('A shade strikes you!');
    }
    this.collectDrops();
  }

  private updateSurvival(dt: number): void {
    if (this.world.mode === MODE_CREATIVE) return;
    if (this.survival.dead) {
      this.keys.clear();
      this.input.clear();
      return;
    }
    const feetY = this.player.y - EYE_HEIGHT;
    const inWater = feetY < WATER_Y - 0.2;
    const underwater = this.player.y < WATER_Y;
    const moving = this.input.forward || this.input.back || this.input.left || this.input.right;
    this.survival.tick(dt, inWater, underwater, this.input.sprint && moving);
    if (this.player.grounded) {
      if (!this.wasGrounded && this.fallPeak - this.player.y > 0) {
        this.survival.fallDamage(this.fallPeak - (this.player.y - EYE_HEIGHT));
      }
      this.wasGrounded = true;
      this.fallPeak = this.player.y - EYE_HEIGHT;
    } else {
      this.wasGrounded = false;
      const feet = this.player.y - EYE_HEIGHT;
      if (feet > this.fallPeak) this.fallPeak = feet;
    }
    if (inWater && !this.player.flying) this.fallPeak = this.player.y - EYE_HEIGHT;
    if (this.eatTimer > 0) this.eatTimer -= dt;
    if (this.drinkTimer > 0) this.drinkTimer -= dt;
  }

  private updateMobSpawns(dt: number): void {
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer > 0) return;
    this.mobSpawnTimer = 2.5;
    this.mobs.spawn(this.world, this.player.x, this.player.y, this.player.z, this.time.isNight());
  }

  private tick = (time: number) => {
    const dt = Math.min((time - this.previousTime) / 1000, 0.035);
    this.previousTime = time;
    this.updateEnvironment(dt, time);
    this.processQueue();
    if (!this.paused) {
      this.input.forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
      this.input.back = this.keys.has('KeyS') || this.keys.has('ArrowDown');
      this.input.left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
      this.input.right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
      this.input.jump = this.keys.has('Space');
      this.input.down = this.keys.has('KeyQ');
      this.input.sprint = this.keys.has('ShiftLeft');
      if (!this.survival.dead) movePlayer(this.world, this.player, this.input, dt);
      if (this.player.y < -4) this.respawn();
      this.updateMobs(dt);
      this.updateSurvival(dt);
      this.updateMobSpawns(dt);
      this.updateWindow(false);
      raycast(this.world, this.player, 8, 0.045, this.hit);
      this.outline.visible = this.hit.found;
      if (this.hit.found) this.outline.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
      this.syncCamera();
    }
    this.syncMobs();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (time - this.fpsTime > 600) {
      const block = this.hit.found ? this.world.getBlock(this.hit.x, this.hit.y, this.hit.z) : 0;
      const camBiome = biomeAt(this.world.biome, Math.floor(this.player.x), Math.floor(this.player.z), this.world.seed);
      const hours = Math.floor(this.time.hour);
      const minutes = Math.floor((this.time.hour - hours) * 60);
      this.onStats({
        fps: Math.round((this.frames * 1000) / (time - this.fpsTime)),
        x: Math.floor(this.player.x),
        y: Math.floor(this.player.y - EYE_HEIGHT),
        z: Math.floor(this.player.z),
        flying: this.player.flying,
        target: block > 0 ? BLOCK_NAMES[block - 1] : '',
        changed: this.changed,
        health: Math.ceil(this.survival.health),
        hunger: Math.ceil(this.survival.hunger),
        thirst: Math.ceil(this.survival.thirst),
        air: Math.max(0, Math.ceil(this.survival.airTimer)),
        dead: this.survival.dead,
        clock: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        day: this.time.day,
        weather: this.weather.weather,
        biome: BIOME_LABELS[camBiome],
        night: this.time.isNight(),
        underwater: this.player.y < WATER_Y,
        hurt: this.survival.hurtTimer > 0,
        explorer: this.world.mode !== MODE_CREATIVE,
      });
      this.fpsTime = time;
      this.frames = 0;
    }
    if (time - this.saveTime > 15000) {
      this.saveTime = time;
      if (this.onAutoSave) this.onAutoSave();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.chunks.forEach(mesh => mesh.geometry.dispose());
    this.material.map?.dispose();
    this.material.dispose();
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    for (const group of this.mobGroups) {
      if (!group) continue;
      group.traverse(node => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
    }
    for (const mats of this.mobMats) for (const mat of mats) mat.dispose();
    this.disposeList.forEach(fn => fn());
    this.scene.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.dispose(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    if (this.audio) void this.audio.close();
  }
}
