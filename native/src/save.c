#include "save.h"

#include <stdio.h>
#include <string.h>

static void put_u32(unsigned char * buffer, unsigned int value) {
    buffer[0] = (unsigned char)(value & 255);
    buffer[1] = (unsigned char)((value >> 8) & 255);
    buffer[2] = (unsigned char)((value >> 16) & 255);
    buffer[3] = (unsigned char)((value >> 24) & 255);
}

static unsigned int get_u32(const unsigned char * buffer) {
    return (unsigned int)buffer[0] | ((unsigned int)buffer[1] << 8) | ((unsigned int)buffer[2] << 16) | ((unsigned int)buffer[3] << 24);
}

static void put_f64(unsigned char * buffer, double value) {
    unsigned long long bits;
    int i;
    memcpy(&bits, &value, 8);
    for (i = 0; i < 8; i++) buffer[i] = (unsigned char)((bits >> (i * 8)) & 255);
}

static double get_f64(const unsigned char * buffer) {
    unsigned long long bits = 0;
    double value;
    int i;
    for (i = 0; i < 8; i++) bits |= (unsigned long long)buffer[i] << (i * 8);
    memcpy(&value, &bits, 8);
    return value;
}

int sv_save_write(const char * path, World * world, PlayerState * player) {
    FILE * file = fopen(path, "wb");
    unsigned char head[64];
    int i;
    if (!file) return 0;
    memcpy(head, "SVX1", 4);
    put_u32(head + 4, (unsigned int)world->seed);
    head[8] = (unsigned char)world->biome;
    head[9] = (unsigned char)world->mode;
    put_f64(head + 16, player->x);
    put_f64(head + 24, player->y);
    put_f64(head + 32, player->z);
    put_f64(head + 40, player->yaw);
    put_f64(head + 48, player->pitch);
    head[56] = (unsigned char)(player->flying ? 1 : 0);
    put_u32(head + 60, (unsigned int)world->editCount);
    if (fwrite(head, 1, 64, file) != 64) { fclose(file); return 0; }
    for (i = 0; i < world->editCount; i++) {
        unsigned char row[8];
        put_u32(row, (unsigned int)world->editKeys[i]);
        put_u32(row + 4, (unsigned int)world->editValues[i]);
        if (fwrite(row, 1, 8, file) != 8) { fclose(file); return 0; }
    }
    fclose(file);
    return 1;
}

int sv_save_read(const char * path, World * world, PlayerState * player) {
    FILE * file = fopen(path, "rb");
    unsigned char head[64];
    unsigned int count;
    int i;
    if (!file) return 0;
    if (fread(head, 1, 64, file) != 64 || memcmp(head, "SVX1", 4) != 0) { fclose(file); return 0; }
    if ((int)get_u32(head + 4) != (int)world->seed || head[8] != (unsigned char)world->biome) { fclose(file); return 0; }
    player->x = get_f64(head + 16);
    player->y = get_f64(head + 24);
    player->z = get_f64(head + 32);
    player->yaw = get_f64(head + 40);
    player->pitch = get_f64(head + 48);
    player->flying = head[56] != 0;
    count = get_u32(head + 60);
    if (count > 400000) { fclose(file); return 0; }
    for (i = 0; i < (int)count; i++) {
        unsigned char row[8];
        int packed, y, rest, z, x;
        if (fread(row, 1, 8, file) != 8) { fclose(file); return 0; }
        packed = (int)get_u32(row);
        y = packed / (WORLD_SIZE * WORLD_SIZE);
        rest = packed - y * WORLD_SIZE * WORLD_SIZE;
        z = rest / WORLD_SIZE - WORLD_HALF;
        x = rest - (z + WORLD_HALF) * WORLD_SIZE - WORLD_HALF;
        World_setBlock(world, x, y, z, (int)get_u32(row + 4));
        World_rememberEdit(world, x, y, z, (int)get_u32(row + 4));
    }
    fclose(file);
    return 1;
}
