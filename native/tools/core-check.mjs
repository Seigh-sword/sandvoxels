import esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const bundle = path.join(os.tmpdir(), `sandvoxel-core-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [path.join(here, 'core-entry.ts')],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  logLevel: 'silent',
});

const core = await import(bundle);

const round3 = value => Math.floor(value * 1000 + 0.5);

const world = new core.World(82413, core.BIOME_FOREST, core.MODE_CREATIVE);

const slot0 = world.loadChunk(0, 0);
let terrain = 0;
for (let i = 0; i < core.CHUNK_SIZE * core.CHUNK_SIZE * core.WORLD_HEIGHT; i++) terrain += world.chunks[core.slotBase(slot0) + i];
console.log(`terrain ${terrain}`);

let biomes = 0;
for (let gx = -3; gx <= 3; gx++) {
  for (let gz = -3; gz <= 3; gz++) {
    biomes += core.biomeAt(core.BIOME_FOREST, gx * 91, gz * 91, 82413) * 13 + (gx + 4) * 7 + (gz + 4);
  }
}
console.log(`biomes ${biomes}`);

const atlas = new Uint8Array(core.ATLAS_PX * core.TILE_PX * 4);
core.renderAtlas(atlas);
let atlasSum = 0;
for (let i = 0; i < atlas.length; i++) atlasSum += atlas[i];
console.log(`atlas ${atlasSum}`);

const buffer = new core.MeshBuffer(16384);
core.buildChunkMesh(world, 0, 0, buffer);
let posSum = 0;
for (let i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
console.log(`mesh 0 0 ${buffer.vertexCount} ${buffer.indexCount} ${round3(posSum)}`);
core.buildChunkMesh(world, 2, -1, buffer);
posSum = 0;
for (let i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
console.log(`mesh 2 -1 ${buffer.vertexCount} ${buffer.indexCount} ${round3(posSum)}`);

const player = new core.PlayerState(11.5, world.surface(11, 17) + core.EYE_HEIGHT + 1.05, 17.5);
player.yaw = 0.6;
player.pitch = -0.3;
const hit = new core.HitResult();
core.raycast(world, player, 8, 0.045, hit);
console.log(`ray ${hit.found ? 1 : 0} ${hit.x} ${hit.y} ${hit.z} ${hit.prevX} ${hit.prevY} ${hit.prevZ}`);

const input = new core.MoveInput();
input.forward = true;
input.sprint = true;
for (let i = 0; i < 240; i++) {
  if (i === 60) input.jump = true;
  if (i === 64) input.jump = false;
  if (i === 120) { player.flying = true; input.jump = true; }
  if (i === 180) input.jump = false;
  core.movePlayer(world, player, input, 1 / 60);
}
console.log(`player ${round3(player.x)} ${round3(player.y)} ${round3(player.z)} ${player.grounded ? 1 : 0} ${player.flying ? 1 : 0}`);

const surfaceA = world.surface(11, 17);
const surfaceB = world.surface(12, 17);
world.edit(11, surfaceA, 17, 9);
world.edit(12, surfaceB + 1, 17, 0);
const slotEdit = world.loadChunk(0, 1);
let edits = 0;
for (let i = 0; i < core.CHUNK_SIZE * core.CHUNK_SIZE * core.WORLD_HEIGHT; i++) edits += world.chunks[core.slotBase(slotEdit) + i];
console.log(`edits ${edits}`);
console.log(`editcount ${world.editCount}`);

const time = new core.TimeState(9);
for (let i = 0; i < 6000; i++) time.advance(1 / 60);
console.log(`time ${round3(time.hour)} ${time.day} ${round3(time.daylight())} ${time.isNight() ? 1 : 0}`);

const weather = new core.WeatherState();
for (let i = 0; i < 4000; i++) weather.advance(1 / 60, false);
console.log(`weather ${weather.weather} ${round3(weather.timer)} ${round3(weather.intensity)}`);

const survival = new core.Survival();
for (let i = 0; i < 3600; i++) survival.tick(1 / 60, false, false, true);
survival.damage(3);
survival.eat(5);
survival.drink(4);
console.log(`survival ${round3(survival.health)} ${round3(survival.hunger)} ${round3(survival.thirst)} ${survival.dead ? 1 : 0}`);

const mobs = new core.MobSystem();
for (let i = 0; i < 20; i++) mobs.spawn(world, 11.5, 30, 17.5, i % 2 === 0);
for (let i = 0; i < 300; i++) mobs.update(world, 1 / 60, 11.5, 17.5, true);
let mobSum = 0;
for (let i = 0; i < core.MOB_MAX; i++) {
  if (mobs.active[i]) mobSum += mobs.px[i] + mobs.pz[i];
}
console.log(`mobs ${mobs.aliveCount()} ${round3(mobSum)}`);

fs.rmSync(bundle, { force: true });
