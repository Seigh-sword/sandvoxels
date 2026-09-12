#include "render_soft.h"
#include "save.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(int argc, char ** argv) {
    int seed = 82413;
    int biome = BIOME_FOREST;
    int mode = MODE_CREATIVE;
    int ticks = 120;
    int width = 320;
    int height = 200;
    double hour = 9.0;
    int weather = WEATHER_CLEAR;
    const char * out = "build/frame.ppm";
    const char * savePath = NULL;
    World world;
    PlayerState player;
    MoveInput input;
    uint8_t * atlas;
    uint8_t * frame;
    unsigned long long checksum = 0;
    int i;
    FILE * file;

    if (argc > 1) seed = atoi(argv[1]);
    if (argc > 2) biome = atoi(argv[2]);
    if (argc > 3) mode = atoi(argv[3]);
    if (argc > 4) ticks = atoi(argv[4]);
    if (argc > 5) width = atoi(argv[5]);
    if (argc > 6) height = atoi(argv[6]);
    if (argc > 7) out = argv[7];
    if (argc > 8) savePath = argv[8];
    if (argc > 9) hour = atof(argv[9]);
    if (argc > 10) weather = atoi(argv[10]);

    World_ctor(&world, seed, biome, mode);
    PlayerState_ctor(&player, 11.5, World_surface(&world, 11, 17) + EYE_HEIGHT + 1.05, 17.5);
    MoveInput_ctor(&input);
    player.yaw = 0.7;
    player.pitch = -0.22;
    if (savePath) sv_save_read(savePath, &world, &player, &hour, &weather);

    input.forward = 1;
    input.sprint = 1;
    for (i = 0; i < ticks; i++) {
        player.yaw += 0.004;
        if (i == 40) input.jump = 1;
        if (i == 46) input.jump = 0;
        sv_movePlayer(&world, &player, &input, 1.0 / 60.0);
    }

    atlas = malloc((size_t)ATLAS_PX * TILE_PX * 4);
    frame = malloc((size_t)width * height * 3);
    if (!atlas || !frame) return 1;
    sv_render_atlas_rgba(atlas);
    sv_render_frame(&world, &player, atlas, frame, width, height, 75.0, hour, weather);
    for (i = 0; i < width * height * 3; i++) checksum += frame[i];

    file = fopen(out, "wb");
    if (!file) return 1;
    fprintf(file, "P6\n%d %d\n255\n", width, height);
    fwrite(frame, 1, (size_t)width * height * 3, file);
    fclose(file);

    if (savePath) sv_save_write(savePath, &world, &player, hour, weather);

    printf("seed %d biome %d ticks %d size %dx%d pos %d %d %d checksum %llu\n",
        seed, biome, ticks, width, height,
        (int)player.x, (int)player.y, (int)player.z, checksum);
    printf("wrote %s\n", out);
    free(atlas);
    free(frame);
    free(world.chunks);
    free(world.slotKey);
    free(world.slotUsed);
    free(world.slotTick);
    free(world.hashMap);
    free(world.editXZ);
    free(world.editY);
    free(world.editValues);
    return 0;
}
