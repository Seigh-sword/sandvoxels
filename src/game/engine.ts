import * as THREE from 'three';
import { blocks, loadLocal, saveLocal, type Settings, type World } from './types';

const SIZE = 80;
const HALF = SIZE / 2;
const CHUNK = 16;
const HEIGHT = 44;
const EYE = 1.65;
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

type SavedGame = { edits: Record<string, number>; position?: number[]; rotation?: number[]; flying?: boolean };
export type GameStats = { fps: number; x: number; y: number; z: number; flying: boolean; target: string; changed: number };

function randomAt(x: number, z: number, seed: number) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.013) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = randomAt(ix, iz, seed), b = randomAt(ix + 1, iz, seed);
  const c = randomAt(ix, iz + 1, seed), d = randomAt(ix + 1, iz + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

// Every tile is generated locally: no game textures or external assets are required.
function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const colors = ['#75a74c', '#92704e', '#999b94', '#795736', '#59833a', '#ddc895', '#e5eeeb', '#b5925c', '#a86049', '#75a74c', '#b28d56', '#dfc18b', '#607a49', '#8d897e', '#abb1a0', '#c9c6b9'];
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(index * 16, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = randomAt(x, y, index * 39);
        ctx.fillStyle = n > 0.5 ? `rgba(255,255,225,${(n - .5) * .28})` : `rgba(25,29,16,${(.5 - n) * .3})`;
        ctx.fillRect(index * 16 + x, y, 1 + (n > .8 ? 1 : 0), 1);
      }
    }
    if (index === 9) {
      ctx.fillStyle = '#8a6949';
      ctx.fillRect(index * 16, 5, 16, 11);
      for (let x = 0; x < 16; x++) {
        ctx.fillStyle = x % 3 ? '#689644' : '#7da84e';
        ctx.fillRect(index * 16 + x, 4, 1, 1 + Math.floor(randomAt(x, 1, 6) * 4));
      }
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = 'rgba(52,37,25,.15)';
        ctx.fillRect(index * 16 + (i * 7 % 16), 8 + (i * 3 % 8), 2, 1);
      }
    }
    if (index === 3) {
      ctx.fillStyle = '#5d432c';
      for (let x = 2; x < 16; x += 4) ctx.fillRect(index * 16 + x, 0, 1, 16);
    }
    if (index === 7 || index === 8) {
      ctx.fillStyle = index === 7 ? '#82683f' : '#b4aa90';
      for (let y = 3; y < 16; y += 4) {
        ctx.fillRect(index * 16, y, 16, 1);
        ctx.fillRect(index * 16 + (y % 8 === 3 ? 4 : 12), y - 3, 1, 3);
      }
    }
    if (index === 10) {
      ctx.strokeStyle = '#7c603b';
      ctx.strokeRect(index * 16 + 2, 2, 12, 12);
      ctx.strokeRect(index * 16 + 5, 5, 6, 6);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}

const faces = [
  { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 1], [1, 1, 0]] },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]] },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
];

export class VoxelEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  data = new Uint8Array(SIZE * SIZE * HEIGHT);
  chunks = new Map<string, THREE.Mesh>();
  edits: Record<string, number> = {};
  keys = new Set<string>();
  selected = 1;
  paused = true;
  flying = false;
  yaw = 0;
  pitch = -.15;
  velocityY = 0;
  grounded = false;
  changed = 0;
  target: { x: number; y: number; z: number; before: number[] } | null = null;
  private material: THREE.MeshLambertMaterial;
  private outline: THREE.LineSegments;
  private raf = 0;
  private previousTime = 0;
  private fpsTime = 0;
  private frames = 0;
  private saveTime = 0;
  private audio?: AudioContext;
  private observer: ResizeObserver;
  private direction = new THREE.Vector3();
  private clouds = new THREE.Group();
  private disposeList: (() => void)[] = [];
  private onStats: (stats: GameStats) => void;

  constructor(container: HTMLDivElement, public world: World, public settings: Settings, onStats: (stats: GameStats) => void) {
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.quality === 'High', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === 'Performance' ? 1 : settings.quality === 'High' ? 2 : 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(world.biome === 'Desert' ? '#e9c6a0' : '#b0d5df');
    this.renderer.shadowMap.enabled = settings.quality === 'High';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    const sky = world.biome === 'Desert' ? 0xe9c6a0 : 0xb0d5df;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, settings.quality === 'Performance' ? 27 : 42, 88);
    this.camera = new THREE.PerspectiveCamera(settings.fov, container.clientWidth / container.clientHeight, .05, 150);
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
    sun.shadow.normalBias = .04;
    this.scene.add(sun);
    this.material = new THREE.MeshLambertMaterial({ map: makeAtlas() });
    this.generateTerrain();
    const save = loadLocal<SavedGame>(`blockhaven-world-${world.id}`, { edits: {} });
    this.edits = save.edits || {};
    Object.entries(this.edits).forEach(([key, value]) => {
      const [x, y, z] = key.split(',').map(Number);
      this.setBlock(x, y, z, value);
    });
    for (let x = -HALF; x < HALF; x += CHUNK) for (let z = -HALF; z < HALF; z += CHUNK) this.buildChunk(x, z);
    this.addScenery();
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.007, 1.007, 1.007)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.camera.position.set(11.5, this.surface(11, 17) + EYE + 1.05, 17.5);
    if (save.position && save.position.every(Number.isFinite)) this.camera.position.fromArray(save.position);
    if (save.rotation) { this.yaw = save.rotation[0]; this.pitch = save.rotation[1]; }
    this.flying = world.mode === 'Creative' && !!save.flying;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.observer = new ResizeObserver(() => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
    this.observer.observe(container);
    this.raf = requestAnimationFrame(this.tick);
  }

  private index(x: number, y: number, z: number) { return (x + HALF) + (z + HALF) * SIZE + y * SIZE * SIZE; }
  getBlock(x: number, y: number, z: number) {
    if (x < -HALF || x >= HALF || z < -HALF || z >= HALF || y < 0 || y >= HEIGHT) return 0;
    return this.data[this.index(x, y, z)];
  }
  private setBlock(x: number, y: number, z: number, type: number) {
    if (x < -HALF || x >= HALF || z < -HALF || z >= HALF || y < 0 || y >= HEIGHT) return;
    this.data[this.index(x, y, z)] = type;
  }
  private terrainHeight(x: number, z: number) {
    const seed = this.world.seed;
    const mountain = this.world.biome === 'Alpine' ? 20 : this.world.biome === 'Desert' ? 12 : 9;
    let h = 3 + noise(x / 23, z / 23, seed) * mountain + noise(x / 8, z / 8, seed + 1) * 3;
    const river = Math.abs(x - Math.sin(z / 13 + seed) * 7 + 4);
    if (this.world.biome !== 'Desert' && river < 5) h = THREE.MathUtils.lerp(1.4, h, Math.max(0, (river - 2) / 3));
    return Math.floor(h);
  }
  private generateTerrain() {
    const biome = this.world.biome;
    for (let x = -HALF; x < HALF; x++) {
      for (let z = -HALF; z < HALF; z++) {
        const h = this.terrainHeight(x, z);
        for (let y = 0; y <= h; y++) {
          const top = biome === 'Desert' || h < 3 ? 6 : biome === 'Alpine' ? 7 : 1;
          this.setBlock(x, y, z, y === h ? top : y > h - 3 ? (biome === 'Desert' ? 6 : 2) : 3);
        }
      }
    }
    for (let x = -HALF + 3; x < HALF - 3; x++) {
      for (let z = -HALF + 3; z < HALF - 3; z++) {
        const h = this.terrainHeight(x, z);
        if (h < 4 || randomAt(x, z, this.world.seed + 18) < .984 || (Math.abs(x - 11) < 3 && Math.abs(z - 17) < 3)) continue;
        if (biome === 'Desert') {
          for (let y = 1; y < 4; y++) this.setBlock(x, h + y, z, 5);
          this.setBlock(x + 1, h + 2, z, 5);
          this.setBlock(x + 1, h + 3, z, 5);
        } else {
          const trunk = biome === 'Alpine' ? 6 : 4;
          for (let y = 1; y <= trunk; y++) this.setBlock(x, h + y, z, 4);
          for (let dy = -2; dy <= 1; dy++) {
            const radius = biome === 'Alpine' ? Math.max(1, 2 - Math.max(0, dy)) : dy === 1 ? 1 : 2;
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) === radius && Math.abs(dz) === radius && randomAt(dx + x, dz + z, dy) < .5) continue;
                if (dx === 0 && dz === 0 && dy <= 0) continue;
                this.setBlock(x + dx, h + trunk + dy, z + dz, biome === 'Alpine' && dy === 1 ? 7 : 5);
              }
            }
          }
        }
      }
    }
  }
  private surface(x: number, z: number) {
    for (let y = HEIGHT - 1; y >= 0; y--) if (this.getBlock(x, y, z)) return y;
    return 0;
  }

  private buildChunk(cx: number, cz: number) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let x = cx; x < cx + CHUNK; x++) {
      for (let z = cz; z < cz + CHUNK; z++) {
        for (let y = 0; y < HEIGHT; y++) {
          const type = this.getBlock(x, y, z);
          if (!type) continue;
          faces.forEach((face, f) => {
            if (this.getBlock(x + face.n[0], y + face.n[1], z + face.n[2])) return;
            if (y === 0 && f === 3) return;
            let tile = type - 1;
            if (type === 1) tile = f === 2 ? 0 : f === 3 ? 1 : 9;
            if (type === 4 && (f === 2 || f === 3)) tile = 10;
            const base = positions.length / 3;
            face.corners.forEach((corner, i) => {
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              normals.push(...face.n);
              uvs.push((tile + (i % 2 ? .995 : .005)) / 16, i < 2 ? .005 : .995);
            });
            indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
          });
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const chunkKey = `${cx},${cz}`;
    const old = this.chunks.get(chunkKey);
    if (old) { old.geometry.dispose(); old.geometry = geometry; }
    else {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.chunks.set(chunkKey, mesh);
    }
  }
  private updateChunk(x: number, z: number) {
    const chunk = (n: number) => Math.floor((n + HALF) / CHUNK) * CHUNK - HALF;
    const list = new Set([`${chunk(x)},${chunk(z)}`]);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = chunk(x + dx), cz = chunk(z + dz);
      if (cx >= -HALF && cx < HALF && cz >= -HALF && cz < HALF) list.add(`${cx},${cz}`);
    }
    list.forEach(key => { const [cx, cz] = key.split(',').map(Number); this.buildChunk(cx, cz); });
  }
  private addScenery() {
    if (this.world.biome !== 'Desert') {
      const waterGeometry = new THREE.PlaneGeometry(SIZE, SIZE);
      const waterMaterial = new THREE.MeshPhongMaterial({ color: this.world.biome === 'Alpine' ? 0xa0d6e0 : 0x489fb8, transparent: true, opacity: .72, shininess: 70, side: THREE.DoubleSide });
      const water = new THREE.Mesh(waterGeometry, waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 2.7;
      this.scene.add(water);
      this.disposeList.push(() => { waterGeometry.dispose(); waterMaterial.dispose(); });
    }
    const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xfffcf1, transparent: true, opacity: .9 });
    for (let i = 0; i < 26; i++) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      cloud.position.set(randomAt(i, 1, this.world.seed) * 160 - 80, 32 + randomAt(i, 2, 8) * 10, randomAt(i, 3, 9) * 160 - 80);
      cloud.scale.set(5 + randomAt(i, 4, 6) * 12, 1.3 + randomAt(i, 2, 6), 3 + randomAt(i, 5, 6) * 6);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    this.disposeList.push(() => { cloudGeometry.dispose(); cloudMaterial.dispose(); });
  }

  look(dx: number, dy: number) {
    if (this.paused) return;
    const sensitivity = .0007 + this.settings.sensitivity * .000033;
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity * (this.settings.invertY ? -1 : 1), -1.54, 1.54);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  toggleFly() {
    if (this.world.mode !== 'Creative') return;
    this.flying = !this.flying;
    this.velocityY = 0;
  }
  setPaused(paused: boolean) { this.paused = paused; this.keys.clear(); }
  private collides(x: number, y: number, z: number) {
    if (x < -HALF + .3 || x > HALF - .3 || z < -HALF + .3 || z > HALF - .3) return true;
    for (let bx = Math.floor(x - .25); bx <= Math.floor(x + .25); bx++) {
      for (let bz = Math.floor(z - .25); bz <= Math.floor(z + .25); bz++) {
        for (let by = Math.floor(y - EYE + .02); by <= Math.floor(y + .1); by++) {
          if (this.getBlock(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }
  private move(dt: number) {
    const pos = this.camera.position;
    const speed = (this.keys.has('ShiftLeft') ? 8 : 4.5) * (this.flying ? 1.8 : 1);
    let forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    let right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const len = Math.hypot(forward, right) || 1;
    forward /= len; right /= len;
    const dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) * speed * dt;
    const dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) * speed * dt;
    if (!this.collides(pos.x + dx, pos.y, pos.z)) pos.x += dx;
    else if (!this.flying && this.grounded && !this.collides(pos.x + dx, pos.y + 1.01, pos.z)) { pos.x += dx; pos.y += 1.01; }
    if (!this.collides(pos.x, pos.y, pos.z + dz)) pos.z += dz;
    else if (!this.flying && this.grounded && !this.collides(pos.x, pos.y + 1.01, pos.z + dz)) { pos.z += dz; pos.y += 1.01; }
    if (this.flying) {
      const dy = (Number(this.keys.has('Space')) - Number(this.keys.has('KeyQ'))) * speed * dt;
      if (!this.collides(pos.x, pos.y + dy, pos.z)) pos.y = Math.min(HEIGHT + 10, pos.y + dy);
    } else {
      if (this.keys.has('Space') && this.grounded) { this.velocityY = 7.3; this.grounded = false; }
      this.velocityY -= 22 * dt;
      const nextY = pos.y + this.velocityY * dt;
      if (!this.collides(pos.x, nextY, pos.z)) { pos.y = nextY; this.grounded = false; }
      else { this.grounded = this.velocityY < 0; this.velocityY = 0; }
    }
    if (pos.y < -10) {
      pos.set(11.5, this.surface(11, 17) + EYE + 1.05, 17.5);
      this.velocityY = 0;
    }
  }
  private findTarget() {
    this.camera.getWorldDirection(this.direction);
    const pos = this.camera.position;
    let before = [Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)];
    this.target = null;
    for (let distance = 0; distance < 8; distance += .045) {
      const x = Math.floor(pos.x + this.direction.x * distance);
      const y = Math.floor(pos.y + this.direction.y * distance);
      const z = Math.floor(pos.z + this.direction.z * distance);
      if (this.getBlock(x, y, z)) { this.target = { x, y, z, before }; break; }
      before = [x, y, z];
    }
    this.outline.visible = !!this.target;
    if (this.target) this.outline.position.set(this.target.x + .5, this.target.y + .5, this.target.z + .5);
  }
  act(place: boolean) {
    if (this.paused) return;
    this.findTarget();
    if (!this.target) return;
    let { x, y, z } = this.target;
    if (place) [x, y, z] = this.target.before;
    if (y < 1 || y >= HEIGHT || x < -HALF || x >= HALF || z < -HALF || z >= HALF) return;
    if (place) {
      const pos = this.camera.position;
      if (x + 1 > pos.x - .25 && x < pos.x + .25 && z + 1 > pos.z - .25 && z < pos.z + .25 && y + 1 > pos.y - EYE && y < pos.y + .1) return;
    }
    const type = place ? this.selected : 0;
    this.setBlock(x, y, z, type);
    this.edits[keyOf(x, y, z)] = type;
    this.changed++;
    this.updateChunk(x, z);
    this.playSound(place);
  }
  private playSound(place: boolean) {
    if (!this.settings.sound) return;
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(place ? 220 : 110, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(45, this.audio.currentTime + .08);
      gain.gain.setValueAtTime(this.settings.volume / 500, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, this.audio.currentTime + .1);
      oscillator.connect(gain); gain.connect(this.audio.destination);
      oscillator.start(); oscillator.stop(this.audio.currentTime + .11);
    } catch { /* Sound is optional if the browser disables audio. */ }
  }
  save() {
    return saveLocal(`blockhaven-world-${this.world.id}`, {
      edits: this.edits,
      position: this.camera.position.toArray(),
      rotation: [this.yaw, this.pitch],
      flying: this.flying,
    });
  }
  private tick = (time: number) => {
    const dt = Math.min((time - (this.previousTime || time)) / 1000, .035);
    this.previousTime = time;
    if (!this.paused) {
      this.move(dt);
      this.findTarget();
      this.clouds.position.x = Math.sin(time / 150000) * 10;
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (time - this.fpsTime > 600) {
      const pos = this.camera.position;
      this.onStats({ fps: Math.round(this.frames * 1000 / (time - this.fpsTime)), x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), flying: this.flying, target: this.target ? blocks[this.getBlock(this.target.x, this.target.y, this.target.z) - 1]?.name || '' : '', changed: this.changed });
      this.fpsTime = time; this.frames = 0;
    }
    if (time - this.saveTime > 15000) { this.save(); this.saveTime = time; }
    this.raf = requestAnimationFrame(this.tick);
  };
  dispose() {
    this.save();
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
    void this.audio?.close();
  }
}
