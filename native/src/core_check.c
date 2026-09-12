#include "render_soft.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static double round3(double value) {
    return floor(value * 1000.0 + 0.5);
}

int main(void) {
    World world;
    MeshBuffer buffer;
    PlayerState player;
    MoveInput input;
    HitResult hit;
    TimeState ts;
    WeatherState ws;
    Survival sv;
    MobSystem mobs;
    uint8_t * atlas;
    long long terrain = 0;
    long long biomes = 0;
    long long atlasSum = 0;
    long long edits = 0;
    double mobSum = 0;
    double posSum;
    int slot0;
    int slotEdit;
    int i;
    int gx;
    int gz;

    World_ctor(&world, 82413, BIOME_FOREST, MODE_CREATIVE);

    slot0 = (int)World_loadChunk(&world, 0, 0);
    for (i = 0; i < CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT; i++) terrain += world.chunks[(int)sv_slotBase(slot0) + i];
    printf("terrain %lld\n", terrain);

    for (gx = -3; gx <= 3; gx++) {
        for (gz = -3; gz <= 3; gz++) {
            biomes += (long long)(sv_biomeAt(BIOME_FOREST, gx * 91, gz * 91, 82413) * 13 + (gx + 4) * 7 + (gz + 4));
        }
    }
    printf("biomes %lld\n", biomes);

    atlas = malloc((size_t)ATLAS_PX * TILE_PX * 4);
    sv_render_atlas_rgba(atlas);
    for (i = 0; i < ATLAS_PX * TILE_PX * 4; i++) atlasSum += atlas[i];
    printf("atlas %lld\n", atlasSum);

    MeshBuffer_ctor(&buffer, 16384);
    sv_buildChunkMesh(&world, 0, 0, &buffer);
    posSum = 0;
    for (i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
    printf("mesh 0 0 %d %d %lld\n", (int)buffer.vertexCount, (int)buffer.indexCount, (long long)round3(posSum));
    sv_buildChunkMesh(&world, 2, -1, &buffer);
    posSum = 0;
    for (i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
    printf("mesh 2 -1 %d %d %lld\n", (int)buffer.vertexCount, (int)buffer.indexCount, (long long)round3(posSum));

    PlayerState_ctor(&player, 11.5, World_surface(&world, 11, 17) + EYE_HEIGHT + 1.05, 17.5);
    player.yaw = 0.6;
    player.pitch = -0.3;
    HitResult_ctor(&hit);
    sv_raycast(&world, &player, 8, 0.045, &hit);
    printf("ray %d %d %d %d %d %d %d\n", (int)hit.found, (int)hit.x, (int)hit.y, (int)hit.z, (int)hit.prevX, (int)hit.prevY, (int)hit.prevZ);

    MoveInput_ctor(&input);
    input.forward = 1;
    input.sprint = 1;
    for (i = 0; i < 240; i++) {
        if (i == 60) input.jump = 1;
        if (i == 64) input.jump = 0;
        if (i == 120) { player.flying = 1; input.jump = 1; }
        if (i == 180) input.jump = 0;
        sv_movePlayer(&world, &player, &input, 1.0 / 60.0);
    }
    printf("player %lld %lld %lld %d %d\n",
        (long long)round3(player.x), (long long)round3(player.y), (long long)round3(player.z),
        player.grounded ? 1 : 0, player.flying ? 1 : 0);

    {
        int surfaceA = (int)World_surface(&world, 11, 17);
        int surfaceB = (int)World_surface(&world, 12, 17);
        World_edit(&world, 11, surfaceA, 17, 9);
        World_edit(&world, 12, surfaceB + 1, 17, 0);
    }
    slotEdit = (int)World_loadChunk(&world, 0, 1);
    for (i = 0; i < CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT; i++) edits += world.chunks[(int)sv_slotBase(slotEdit) + i];
    printf("edits %lld\n", edits);
    printf("editcount %d\n", (int)world.editCount);

    TimeState_ctor(&ts, 9);
    for (i = 0; i < 6000; i++) TimeState_advance(&ts, 1.0 / 60.0);
    printf("time %lld %d %lld %d\n", (long long)round3(ts.hour), (int)ts.day,
        (long long)round3(TimeState_daylight(&ts)), TimeState_isNight(&ts) ? 1 : 0);

    WeatherState_ctor(&ws);
    for (i = 0; i < 4000; i++) WeatherState_advance(&ws, 1.0 / 60.0, 0);
    printf("weather %d %lld %lld\n", (int)ws.weather, (long long)round3(ws.timer), (long long)round3(ws.intensity));

    Survival_ctor(&sv);
    for (i = 0; i < 3600; i++) Survival_tick(&sv, 1.0 / 60.0, 0, 0, 1);
    Survival_damage(&sv, 3);
    Survival_eat(&sv, 5);
    Survival_drink(&sv, 4);
    printf("survival %lld %lld %lld %d\n", (long long)round3(sv.health), (long long)round3(sv.hunger),
        (long long)round3(sv.thirst), sv.dead ? 1 : 0);

    MobSystem_ctor(&mobs);
    for (i = 0; i < 20; i++) MobSystem_spawn(&mobs, &world, 11.5, 30, 17.5, i % 2 == 0);
    for (i = 0; i < 300; i++) MobSystem_update(&mobs, &world, 1.0 / 60.0, 11.5, 17.5, 1);
    for (i = 0; i < MOB_MAX; i++) {
        if (mobs.active[i]) mobSum += mobs.px[i] + mobs.pz[i];
    }
    printf("mobs %d %lld\n", (int)MobSystem_aliveCount(&mobs), (long long)round3(mobSum));

    free(atlas);
    free(buffer.positions);
    free(buffer.normals);
    free(buffer.uvs);
    free(buffer.indices);
    free(world.chunks);
    free(world.slotKey);
    free(world.slotUsed);
    free(world.slotTick);
    free(world.hashMap);
    free(world.editXZ);
    free(world.editY);
    free(world.editValues);
    free(mobs.active);
    free(mobs.kind);
    free(mobs.px);
    free(mobs.py);
    free(mobs.pz);
    free(mobs.vy);
    free(mobs.yaw);
    free(mobs.hp);
    free(mobs.timer);
    free(mobs.hurt);
    free(mobs.attackTimer);
    return 0;
}
