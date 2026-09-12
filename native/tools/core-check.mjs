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
let terrain = 0;
for (let i = 0; i < world.data.length; i++) terrain += world.data[i];
console.log(`terrain ${terrain}`);

const atlas = new Uint8Array(core.ATLAS_PX * core.TILE_PX * 4);
core.renderAtlas(atlas);
let atlasSum = 0;
for (let i = 0; i < atlas.length; i++) atlasSum += atlas[i];
console.log(`atlas ${atlasSum}`);

const buffer = new core.MeshBuffer(16384);
core.buildChunkMesh(world, -40, -40, buffer);
let posSum = 0;
for (let i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
console.log(`mesh -40 -40 ${buffer.vertexCount} ${buffer.indexCount} ${round3(posSum)}`);
core.buildChunkMesh(world, -24, -8, buffer);
posSum = 0;
for (let i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
console.log(`mesh -24 -8 ${buffer.vertexCount} ${buffer.indexCount} ${round3(posSum)}`);

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
let edits = 0;
for (let i = 0; i < world.data.length; i++) edits += world.data[i];
console.log(`edits ${edits}`);
console.log(`editcount ${world.editCount}`);

fs.rmSync(bundle, { force: true });
