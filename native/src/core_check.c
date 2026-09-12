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
    uint8_t * atlas;
    long long terrain = 0;
    long long atlasSum = 0;
    long long edits = 0;
    double posSum;
    int i;

    World_ctor(&world, 82413, BIOME_FOREST, MODE_CREATIVE);
    for (i = 0; i < WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT; i++) terrain += world.data[i];
    printf("terrain %lld\n", terrain);

    atlas = malloc((size_t)ATLAS_PX * TILE_PX * 4);
    sv_render_atlas_rgba(atlas);
    for (i = 0; i < ATLAS_PX * TILE_PX * 4; i++) atlasSum += atlas[i];
    printf("atlas %lld\n", atlasSum);

    MeshBuffer_ctor(&buffer, 16384);
    sv_buildChunkMesh(&world, -40, -40, &buffer);
    posSum = 0;
    for (i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
    printf("mesh -40 -40 %d %d %lld\n", (int)buffer.vertexCount, (int)buffer.indexCount, (long long)round3(posSum));
    sv_buildChunkMesh(&world, -24, -8, &buffer);
    posSum = 0;
    for (i = 0; i < buffer.vertexCount * 3; i++) posSum += buffer.positions[i];
    printf("mesh -24 -8 %d %d %lld\n", (int)buffer.vertexCount, (int)buffer.indexCount, (long long)round3(posSum));

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
        int surfaceA = World_surface(&world, 11, 17);
        int surfaceB = World_surface(&world, 12, 17);
        World_edit(&world, 11, surfaceA, 17, 9);
        World_edit(&world, 12, surfaceB + 1, 17, 0);
    }
    for (i = 0; i < WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT; i++) edits += world.data[i];
    printf("edits %lld\n", edits);
    printf("editcount %d\n", (int)world.editCount);

    free(atlas);
    free(buffer.positions);
    free(buffer.normals);
    free(buffer.uvs);
    free(buffer.indices);
    free(world.data);
    free(world.editKeys);
    free(world.editValues);
    return 0;
}
