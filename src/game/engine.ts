import * as THREE from 'three';
import {
  ATLAS_PX, TILE_PX, blockSideColor, blockTopColor, renderAtlas,
} from '../core/palette';
import { MeshBuffer, buildChunkMesh, chunkOf } from '../core/mesh';
import { HitResult, MoveInput, PlayerState, lookDelta, movePlayer, overlapsPlayer, raycast } from '../core/player';
import {
  BIOME_ALPINE, BIOME_DESERT, CHUNK_SIZE, MODE_CREATIVE, WORLD_HALF, WORLD_HEIGHT, WORLD_SIZE, World,
} from '../core/world';

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
}

export interface SavedWorld {
  keys: number[];
  values: number[];
  position: number[];
  rotation: number[];
  flying: boolean;
}

export const BLOCK_NAMES = ['Grass', 'Dirt', 'Stone', 'Oak log', 'Leaves', 'Sand', 'Snow', 'Oak planks', 'Brick'];

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
  settings: EngineSettings;
  selected = 1;
  paused = true;
  changed = 0;
  keys = new Set<string>();
  private chunks = new Map<string, THREE.Mesh>();
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
  private clouds = new THREE.Group();
  private disposeList: (() => void)[] = [];
  private onStats: (stats: GameStats) => void;

  constructor(container: HTMLDivElement, seed: number, biome: number, mode: number, settings: EngineSettings, onStats: (stats: GameStats) => void) {
    this.container = container;
    this.settings = settings;
    this.onStats = onStats;
    this.world = new World(seed, biome, mode);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = settings.quality === 'High';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sky = biome === BIOME_DESERT ? 0xe9c6a0 : 0xb0d5df;
    this.renderer.setClearColor(sky);
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, settings.quality === 'Performance' ? 27 : 42, 88);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 150);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight(0xe8f5ff, 0x77724a, 2.3));
    const sun = new THREE.DirectionalLight(0xfff1c9, 2.1);
    sun.position.set(-30, 65, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.far = 120;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.material = new THREE.MeshLambertMaterial({ map: makeAtlasTexture() });
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += CHUNK_SIZE) {
      for (let z = -WORLD_HALF; z < WORLD_HALF; z += CHUNK_SIZE) this.buildChunk(x, z);
    }
    this.addScenery(biome);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.007, 1.007, 1.007)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.player = new PlayerState(11.5, this.world.surface(11, 17) + 1.65 + 1.05, 17.5);
    container.appendChild(this.renderer.domElement);
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.previousTime = performance.now();
    this.fpsTime = this.previousTime;
    this.saveTime = this.previousTime;
    this.raf = requestAnimationFrame(this.tick);
  }

  loadSave(save: SavedWorld | null): void {
    if (!save) return;
    const count = Math.min(save.keys.length, save.values.length);
    this.world.applySavedEdits(new Int32Array(save.keys), new Uint8Array(save.values), count);
    this.changed = count;
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += CHUNK_SIZE) {
      for (let z = -WORLD_HALF; z < WORLD_HALF; z += CHUNK_SIZE) this.buildChunk(x, z);
    }
    if (save.position && save.position.length === 3 && save.position.every(Number.isFinite)) {
      this.player.x = save.position[0];
      this.player.y = save.position[1];
      this.player.z = save.position[2];
    }
    if (save.rotation && save.rotation.length === 2 && save.rotation.every(Number.isFinite)) {
      this.player.yaw = save.rotation[0];
      this.player.pitch = save.rotation[1];
    }
    if (this.world.mode === MODE_CREATIVE) this.player.flying = !!save.flying;
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
      const sky = this.world.biome === BIOME_DESERT ? 0xe9c6a0 : 0xb0d5df;
      this.scene.fog = new THREE.Fog(sky, settings.quality === 'Performance' ? 27 : 42, 88);
      this.resize();
    }
  }

  private buildChunk(cx: number, cz: number): void {
    buildChunkMesh(this.world, cx, cz, this.buffer);
    const key = `${cx},${cz}`;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.buffer.positions.slice(0, this.buffer.vertexCount * 3), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.buffer.normals.slice(0, this.buffer.vertexCount * 3), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.buffer.uvs.slice(0, this.buffer.vertexCount * 2), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.buffer.indices.slice(0, this.buffer.indexCount)), 1));
    geometry.computeBoundingSphere();
    const old = this.chunks.get(key);
    if (old) {
      old.geometry.dispose();
      old.geometry = geometry;
    } else {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.chunks.set(key, mesh);
    }
  }

  private updateChunks(x: number, z: number): void {
    const list = [`${chunkOf(x)},${chunkOf(z)}`];
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < neighbors.length; i++) {
      const cx = chunkOf(x + neighbors[i][0]);
      const cz = chunkOf(z + neighbors[i][1]);
      const key = `${cx},${cz}`;
      if (cx >= -WORLD_HALF && cx < WORLD_HALF && cz >= -WORLD_HALF && cz < WORLD_HALF && list.indexOf(key) < 0) list.push(key);
    }
    for (let i = 0; i < list.length; i++) {
      const parts = list[i].split(',');
      this.buildChunk(Number(parts[0]), Number(parts[1]));
    }
  }

  private addScenery(biome: number): void {
    if (biome !== BIOME_DESERT) {
      const waterGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
      const waterMaterial = new THREE.MeshPhongMaterial({
        color: biome === BIOME_ALPINE ? 0xa0d6e0 : 0x489fb8,
        transparent: true,
        opacity: 0.72,
        shininess: 70,
        side: THREE.DoubleSide,
      });
      const water = new THREE.Mesh(waterGeometry, waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 2.7;
      this.scene.add(water);
      this.disposeList.push(() => { waterGeometry.dispose(); waterMaterial.dispose(); });
    }
    const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xfffcf1, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 26; i++) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      const rx = (Math.sin(i * 127.1 + 311.7 + this.world.seed * 0.013) * 43758.5453) % 1;
      const ry = (Math.sin(i * 127.1 + 2 * 311.7 + 8 * 0.013) * 43758.5453) % 1;
      const rz = (Math.sin(i * 127.1 + 3 * 311.7 + 9 * 0.013) * 43758.5453) % 1;
      const rs = (Math.sin(i * 127.1 + 4 * 311.7 + 6 * 0.013) * 43758.5453) % 1;
      cloud.position.set(Math.abs(rx) * 160 - 80, 32 + Math.abs(ry) * 10, Math.abs(rz) * 160 - 80);
      cloud.scale.set(5 + Math.abs(rs) * 12, 1.3 + Math.abs(ry) * 2, 3 + Math.abs(rx) * 6);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    this.disposeList.push(() => { cloudGeometry.dispose(); cloudMaterial.dispose(); });
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

  act(place: boolean): void {
    if (this.paused) return;
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
    if (y < 1 || y >= WORLD_HEIGHT || x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF) return;
    if (place && overlapsPlayer(this.player, x, y, z)) return;
    this.world.edit(x, y, z, place ? this.selected : 0);
    this.changed++;
    this.updateChunks(x, z);
    this.playSound(place);
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

  exportSave(): SavedWorld {
    const keys: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < this.world.editCount; i++) {
      keys.push(this.world.editKeys[i]);
      values.push(this.world.editValues[i]);
    }
    return {
      keys,
      values,
      position: [this.player.x, this.player.y, this.player.z],
      rotation: [this.player.yaw, this.player.pitch],
      flying: this.player.flying,
    };
  }

  private tick = (time: number) => {
    const dt = Math.min((time - this.previousTime) / 1000, 0.035);
    this.previousTime = time;
    if (!this.paused) {
      this.input.forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
      this.input.back = this.keys.has('KeyS') || this.keys.has('ArrowDown');
      this.input.left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
      this.input.right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
      this.input.jump = this.keys.has('Space');
      this.input.down = this.keys.has('KeyQ');
      this.input.sprint = this.keys.has('ShiftLeft');
      movePlayer(this.world, this.player, this.input, dt);
      if (this.player.y < -10) {
        this.player.x = 11.5;
        this.player.y = this.world.surface(11, 17) + 1.65 + 1.05;
        this.player.z = 17.5;
      }
      raycast(this.world, this.player, 8, 0.045, this.hit);
      this.outline.visible = this.hit.found;
      if (this.hit.found) this.outline.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
      this.syncCamera();
      this.clouds.position.x = Math.sin(time / 150000) * 10;
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (time - this.fpsTime > 600) {
      const block = this.hit.found ? this.world.getBlock(this.hit.x, this.hit.y, this.hit.z) : 0;
      this.onStats({
        fps: Math.round((this.frames * 1000) / (time - this.fpsTime)),
        x: Math.floor(this.player.x),
        y: Math.floor(this.player.y),
        z: Math.floor(this.player.z),
        flying: this.player.flying,
        target: block > 0 ? BLOCK_NAMES[block - 1] : '',
        changed: this.changed,
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

  onAutoSave: (() => void) | null = null;

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.chunks.forEach(mesh => mesh.geometry.dispose());
    this.material.map?.dispose();
    this.material.dispose();
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    this.disposeList.forEach(fn => fn());
    this.scene.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.dispose(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    if (this.audio) void this.audio.close();
  }
}
