#include "render_soft.h"
#include "save.h"

#include <SDL2/SDL.h>
#include <SDL2/SDL_opengl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WINDOW_W 960
#define WINDOW_H 600
#define VIEW_R 4
#define CHUNK_SLOTS ((2 * VIEW_R + 1) * (2 * VIEW_R + 1))

typedef struct ChunkMesh {
    GLfloat * positions;
    GLfloat * normals;
    GLfloat * uvs;
    GLuint * indices;
    int vertexCount;
    int indexCount;
    int cx;
    int cz;
} ChunkMesh;

static ChunkMesh meshes[CHUNK_SLOTS];
static World world;
static PlayerState player;
static MoveInput input;
static HitResult hit;
static GLuint atlasTexture = 0;
static int selected = 1;
static double hour = 9.0;
static int weather = WEATHER_CLEAR;
static const char * savePath = "sandvoxel.sav";

static int slotIndex(int dx, int dz) {
    return (dx + VIEW_R) * (2 * VIEW_R + 1) + (dz + VIEW_R);
}

static void rebuildChunk(int slot, int cx, int cz) {
    MeshBuffer buffer;
    ChunkMesh * mesh = &meshes[slot];
    int i;
    MeshBuffer_ctor(&buffer, 16384);
    sv_buildChunkMesh(&world, cx, cz, &buffer);
    free(mesh->positions);
    free(mesh->normals);
    free(mesh->uvs);
    free(mesh->indices);
    mesh->positions = malloc((size_t)(buffer.vertexCount * 3 + 1) * sizeof(GLfloat));
    mesh->normals = malloc((size_t)(buffer.vertexCount * 3 + 1) * sizeof(GLfloat));
    mesh->uvs = malloc((size_t)(buffer.vertexCount * 2 + 1) * sizeof(GLfloat));
    mesh->indices = malloc((size_t)(buffer.indexCount + 1) * sizeof(GLuint));
    for (i = 0; i < buffer.vertexCount * 3; i++) {
        mesh->positions[i] = (GLfloat)buffer.positions[i];
        mesh->normals[i] = (GLfloat)buffer.normals[i];
    }
    for (i = 0; i < buffer.vertexCount * 2; i++) mesh->uvs[i] = (GLfloat)buffer.uvs[i];
    for (i = 0; i < buffer.indexCount; i++) mesh->indices[i] = (GLuint)buffer.indices[i];
    mesh->vertexCount = buffer.vertexCount;
    mesh->indexCount = buffer.indexCount;
    mesh->cx = cx;
    mesh->cz = cz;
    free(buffer.positions);
    free(buffer.normals);
    free(buffer.uvs);
    free(buffer.indices);
}

static void updateWindow(void) {
    const int pcx = (int)sv_chunkOf(player.x);
    const int pcz = (int)sv_chunkOf(player.z);
    int dx, dz;
    for (dx = -VIEW_R; dx <= VIEW_R; dx++) {
        for (dz = -VIEW_R; dz <= VIEW_R; dz++) {
            const int slot = slotIndex(dx, dz);
            if (meshes[slot].indexCount > 0 && meshes[slot].cx == pcx + dx && meshes[slot].cz == pcz + dz) continue;
            rebuildChunk(slot, pcx + dx, pcz + dz);
        }
    }
}

static void rebuildAround(int bx, int bz) {
    const int pcx = (int)sv_chunkOf(player.x);
    const int pcz = (int)sv_chunkOf(player.z);
    const int cx = (int)sv_chunkOf(bx);
    const int cz = (int)sv_chunkOf(bz);
    const int lx = bx - cx * CHUNK_SIZE;
    const int lz = bz - cz * CHUNK_SIZE;
    int dx, dz;
    for (dx = -1; dx <= 1; dx++) {
        for (dz = -1; dz <= 1; dz++) {
            if (dx != 0 && !((dx < 0 && lx == 0) || (dx > 0 && lx == CHUNK_SIZE - 1))) continue;
            if (dz != 0 && !((dz < 0 && lz == 0) || (dz > 0 && lz == CHUNK_SIZE - 1))) continue;
            if (abs(cx + dx - pcx) > VIEW_R || abs(cz + dz - pcz) > VIEW_R) continue;
            rebuildChunk(slotIndex(cx + dx - pcx, cz + dz - pcz), cx + dx, cz + dz);
        }
    }
}

static void act(int place) {
    sv_raycast(&world, &player, 8, 0.045, &hit);
    if (!hit.found) return;
    {
        int x = hit.x, y = hit.y, z = hit.z;
        if (place) { x = hit.prevX; y = hit.prevY; z = hit.prevZ; }
        if (y < 1 || y >= WORLD_HEIGHT) return;
        if (place && sv_overlapsPlayer(&player, x, y, z)) return;
        World_edit(&world, x, y, z, place ? selected : 0);
        rebuildAround(x, z);
    }
}

static void uploadAtlas(void) {
    uint8_t * atlas = malloc((size_t)ATLAS_PX * TILE_PX * 4);
    sv_render_atlas_rgba(atlas);
    glGenTextures(1, &atlasTexture);
    glBindTexture(GL_TEXTURE_2D, atlasTexture);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, ATLAS_PX, TILE_PX, 0, GL_RGBA, GL_UNSIGNED_BYTE, atlas);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    free(atlas);
}

static void perspective(double fovDegrees, double aspect, double near, double far) {
    const double focal = 1.0 / tan(fovDegrees * 0.5 * 3.141592653589793 / 180.0);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glFrustum(-near / focal, near / focal, -near / focal / aspect, near / focal / aspect, near, far);
    glMatrixMode(GL_MODELVIEW);
}

int main(int argc, char ** argv) {
    int seed = 82413;
    int biome = BIOME_FOREST;
    int mode = MODE_CREATIVE;
    SDL_Window * window;
    SDL_GLContext gl;
    int running = 1;
    int lastCX = 1 << 30;
    int lastCZ = 1 << 30;
    Uint32 previous = 0;
    Uint32 lastSave = 0;
    Uint32 lastReport = 0;
    Uint32 frames = 0;

    if (argc > 1) seed = atoi(argv[1]);
    if (argc > 2) biome = atoi(argv[2]);
    if (argc > 3) mode = atoi(argv[3]);
    if (argc > 4) savePath = argv[4];

    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
        fprintf(stderr, "sdl init failed: %s\n", SDL_GetError());
        return 1;
    }
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    window = SDL_CreateWindow("Sandvoxel", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, WINDOW_W, WINDOW_H, SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE);
    if (!window) {
        fprintf(stderr, "window failed: %s\n", SDL_GetError());
        SDL_Quit();
        return 1;
    }
    gl = SDL_GL_CreateContext(window);
    SDL_SetRelativeMouseMode(SDL_TRUE);

    memset(meshes, 0, sizeof(meshes));
    for (int s = 0; s < CHUNK_SLOTS; s++) { meshes[s].cx = 1 << 30; meshes[s].cz = 1 << 30; }
    World_ctor(&world, seed, biome, mode);
    PlayerState_ctor(&player, 11.5, World_surface(&world, 11, 17) + EYE_HEIGHT + 1.05, 17.5);
    MoveInput_ctor(&input);
    HitResult_ctor(&hit);
    sv_save_read(savePath, &world, &player, &hour, &weather);
    updateWindow();

    glEnable(GL_DEPTH_TEST);
    glEnable(GL_TEXTURE_2D);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    uploadAtlas();
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    glEnableClientState(GL_TEXTURE_COORD_ARRAY);

    previous = SDL_GetTicks();
    lastSave = previous;
    lastReport = previous;

    while (running) {
        SDL_Event event;
        Uint32 now = SDL_GetTicks();
        double dt = (now - previous) / 1000.0;
        int pcx, pcz, sky, camBiome;
        double day, dim, light, skyR, skyG, skyB;
        if (dt > 0.035) dt = 0.035;
        previous = now;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) running = 0;
            else if (event.type == SDL_WINDOWEVENT && event.window.event == SDL_WINDOWEVENT_RESIZED) {
                int w, h;
                SDL_GetWindowSize(window, &w, &h);
                glViewport(0, 0, w, h);
                perspective(75.0, (double)w / (double)h, 0.05, 220.0);
            } else if (event.type == SDL_KEYDOWN) {
                switch (event.key.keysym.sym) {
                    case SDLK_ESCAPE: running = 0; break;
                    case SDLK_w: case SDLK_UP: input.forward = 1; break;
                    case SDLK_s: case SDLK_DOWN: input.back = 1; break;
                    case SDLK_a: case SDLK_LEFT: input.left = 1; break;
                    case SDLK_d: case SDLK_RIGHT: input.right = 1; break;
                    case SDLK_SPACE: input.jump = 1; break;
                    case SDLK_q: input.down = 1; break;
                    case SDLK_LSHIFT: input.sprint = 1; break;
                    case SDLK_f: if (mode == MODE_CREATIVE) player.flying = player.flying ? 0 : 1; break;
                    case SDLK_e: act(1); break;
                    case SDLK_r: act(0); break;
                    default:
                        if (event.key.keysym.sym >= SDLK_1 && event.key.keysym.sym <= SDLK_9) selected = event.key.keysym.sym - SDLK_1 + 1;
                        break;
                }
            } else if (event.type == SDL_KEYUP) {
                switch (event.key.keysym.sym) {
                    case SDLK_w: case SDLK_UP: input.forward = 0; break;
                    case SDLK_s: case SDLK_DOWN: input.back = 0; break;
                    case SDLK_a: case SDLK_LEFT: input.left = 0; break;
                    case SDLK_d: case SDLK_RIGHT: input.right = 0; break;
                    case SDLK_SPACE: input.jump = 0; break;
                    case SDLK_q: input.down = 0; break;
                    case SDLK_LSHIFT: input.sprint = 0; break;
                    default: break;
                }
            } else if (event.type == SDL_MOUSEMOTION) {
                sv_lookDelta(&player, event.motion.xrel, event.motion.yrel, 0.0022, 0);
            } else if (event.type == SDL_MOUSEBUTTONDOWN) {
                if (event.button.button == SDL_BUTTON_LEFT) act(0);
                if (event.button.button == SDL_BUTTON_RIGHT) act(1);
            }
        }
        sv_movePlayer(&world, &player, &input, dt);
        if (player.y < -10) {
            player.x = 11.5;
            player.y = World_surface(&world, 11, 17) + EYE_HEIGHT + 1.05;
            player.z = 17.5;
            player.velocityY = 0;
        }
        hour += dt * 0.05;
        while (hour >= 24.0) hour -= 24.0;

        pcx = (int)sv_chunkOf(player.x);
        pcz = (int)sv_chunkOf(player.z);
        if (pcx != lastCX || pcz != lastCZ) {
            lastCX = pcx;
            lastCZ = pcz;
            updateWindow();
        }

        camBiome = (int)sv_biomeAt(world.biome, (int)floor(player.x), (int)floor(player.z), world.seed);
        sky = (int)sv_biomeSky(camBiome);
        {
            double a = (hour - 6.0) / 12.0 * 3.141592653589793;
            day = 0.2 + sin(a) * 1.3;
            if (day < 0.07) day = 0.07;
            if (day > 1.0) day = 1.0;
        }
        dim = weather == WEATHER_STORM ? 0.45 : weather == WEATHER_RAIN ? 0.62 : weather == WEATHER_SNOW ? 0.78 : 1.0;
        skyR = (11.0 + (((sky >> 16) & 255) - 11.0) * day) * (0.35 + 0.65 * dim) / 255.0;
        skyG = (16.0 + (((sky >> 8) & 255) - 16.0) * day) * (0.35 + 0.65 * dim) / 255.0;
        skyB = (38.0 + ((sky & 255) - 38.0) * day) * (0.35 + 0.65 * dim) / 255.0;
        glClearColor((GLfloat)skyR, (GLfloat)skyG, (GLfloat)skyB, 1.0f);
        light = 0.32 + 0.68 * day * dim;

        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        glLoadIdentity();
        glRotated(-player.pitch * 180.0 / 3.141592653589793, 1, 0, 0);
        glRotated(-player.yaw * 180.0 / 3.141592653589793, 0, 1, 0);
        glTranslated(-player.x, -player.y, -player.z);
        glColor4f((GLfloat)light, (GLfloat)light, (GLfloat)light, 1.0f);
        {
            int slot;
            for (slot = 0; slot < CHUNK_SLOTS; slot++) {
                ChunkMesh * mesh = &meshes[slot];
                if (!mesh->indexCount) continue;
                glVertexPointer(3, GL_FLOAT, 0, mesh->positions);
                glNormalPointer(GL_FLOAT, 0, mesh->normals);
                glTexCoordPointer(2, GL_FLOAT, 0, mesh->uvs);
                glDrawElements(GL_TRIANGLES, mesh->indexCount, GL_UNSIGNED_INT, mesh->indices);
            }
        }
        {
            int water = (int)sv_biomeWater(camBiome);
            double wx = floor(player.x / 4.0) * 4.0;
            double wz = floor(player.z / 4.0) * 4.0;
            glDisable(GL_TEXTURE_2D);
            glEnable(GL_BLEND);
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
            glDepthMask(GL_FALSE);
            glColor4f((GLfloat)((((water >> 16) & 255) / 255.0) * light), (GLfloat)((((water >> 8) & 255) / 255.0) * light), (GLfloat)(((water & 255) / 255.0) * light), 0.72f);
            glBegin(GL_QUADS);
            glVertex3f((GLfloat)(wx - 120), (GLfloat)WATER_Y, (GLfloat)(wz - 120));
            glVertex3f((GLfloat)(wx + 120), (GLfloat)WATER_Y, (GLfloat)(wz - 120));
            glVertex3f((GLfloat)(wx + 120), (GLfloat)WATER_Y, (GLfloat)(wz + 120));
            glVertex3f((GLfloat)(wx - 120), (GLfloat)WATER_Y, (GLfloat)(wz + 120));
            glEnd();
            glDepthMask(GL_TRUE);
            glDisable(GL_BLEND);
            glEnable(GL_TEXTURE_2D);
            glColor4f(1.0f, 1.0f, 1.0f, 1.0f);
        }
        SDL_GL_SwapWindow(window);
        frames++;
        if (now - lastReport > 2000) {
            printf("fps %u pos %d %d %d block %d hour %d\n", frames * 1000 / (now - lastReport), (int)player.x, (int)player.y, (int)player.z, selected, (int)hour);
            frames = 0;
            lastReport = now;
        }
        if (now - lastSave > 15000) {
            sv_save_write(savePath, &world, &player, hour, weather);
            lastSave = now;
        }
    }

    sv_save_write(savePath, &world, &player, hour, weather);
    printf("saved to %s\n", savePath);
    SDL_GL_DeleteContext(gl);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
