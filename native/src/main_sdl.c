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
#define CHUNKS 25

typedef struct ChunkMesh {
    GLfloat * positions;
    GLfloat * normals;
    GLfloat * uvs;
    GLuint * indices;
    int vertexCount;
    int indexCount;
} ChunkMesh;

static ChunkMesh meshes[CHUNKS];
static World world;
static PlayerState player;
static MoveInput input;
static HitResult hit;
static GLuint atlasTexture = 0;
static int selected = 1;
static const char * savePath = "sandvoxel.sav";

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
    free(buffer.positions);
    free(buffer.normals);
    free(buffer.uvs);
    free(buffer.indices);
}

static void rebuildAll(void) {
    int slot = 0;
    int x, z;
    for (x = -WORLD_HALF; x < WORLD_HALF; x += CHUNK_SIZE) {
        for (z = -WORLD_HALF; z < WORLD_HALF; z += CHUNK_SIZE) {
            rebuildChunk(slot++, x, z);
        }
    }
}

static void rebuildAround(int bx, int bz) {
    int slot = 0;
    int x, z;
    for (x = -WORLD_HALF; x < WORLD_HALF; x += CHUNK_SIZE) {
        for (z = -WORLD_HALF; z < WORLD_HALF; z += CHUNK_SIZE) {
            int touches = bx >= x - 1 && bx <= x + CHUNK_SIZE && bz >= z - 1 && bz <= z + CHUNK_SIZE;
            if (touches) rebuildChunk(slot, x, z);
            slot++;
        }
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

static void act(int place) {
    sv_raycast(&world, &player, 8, 0.045, &hit);
    if (!hit.found) return;
    {
        int x = hit.x, y = hit.y, z = hit.z;
        if (place) { x = hit.prevX; y = hit.prevY; z = hit.prevZ; }
        if (y < 1 || y >= WORLD_HEIGHT || x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF) return;
        if (place && sv_overlapsPlayer(&player, x, y, z)) return;
        World_edit(&world, x, y, z, place ? selected : 0);
        rebuildAround(x, z);
    }
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

    World_ctor(&world, seed, biome, mode);
    PlayerState_ctor(&player, 11.5, World_surface(&world, 11, 17) + EYE_HEIGHT + 1.05, 17.5);
    MoveInput_ctor(&input);
    HitResult_ctor(&hit);
    sv_save_read(savePath, &world, &player);
    rebuildAll();

    glEnable(GL_DEPTH_TEST);
    glEnable(GL_TEXTURE_2D);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    uploadAtlas();
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    glEnableClientState(GL_TEXTURE_COORD_ARRAY);
    if (world.biome == BIOME_DESERT) glClearColor(0.914f, 0.776f, 0.627f, 1.0f);
    else glClearColor(0.690f, 0.835f, 0.875f, 1.0f);

    previous = SDL_GetTicks();
    lastSave = previous;
    lastReport = previous;

    while (running) {
        SDL_Event event;
        Uint32 now = SDL_GetTicks();
        double dt = (now - previous) / 1000.0;
        if (dt > 0.035) dt = 0.035;
        previous = now;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) running = 0;
            else if (event.type == SDL_WINDOWEVENT && event.window.event == SDL_WINDOWEVENT_RESIZED) {
                int w, h;
                SDL_GetWindowSize(window, &w, &h);
                glViewport(0, 0, w, h);
                perspective(75.0, (double)w / (double)h, 0.05, 150.0);
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

        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        glLoadIdentity();
        glRotated(-player.pitch * 180.0 / 3.141592653589793, 1, 0, 0);
        glRotated(-player.yaw * 180.0 / 3.141592653589793, 0, 1, 0);
        glTranslated(-player.x, -player.y, -player.z);
        {
            int slot;
            for (slot = 0; slot < CHUNKS; slot++) {
                ChunkMesh * mesh = &meshes[slot];
                if (!mesh->indexCount) continue;
                glVertexPointer(3, GL_FLOAT, 0, mesh->positions);
                glNormalPointer(GL_FLOAT, 0, mesh->normals);
                glTexCoordPointer(2, GL_FLOAT, 0, mesh->uvs);
                glDrawElements(GL_TRIANGLES, mesh->indexCount, GL_UNSIGNED_INT, mesh->indices);
            }
        }
        if (world.biome != BIOME_DESERT) {
            glDisable(GL_TEXTURE_2D);
            glEnable(GL_BLEND);
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
            glDepthMask(GL_FALSE);
            glColor4f(0.28f, 0.62f, 0.72f, 0.72f);
            glBegin(GL_QUADS);
            glVertex3f((GLfloat)-WORLD_HALF, 2.7f, (GLfloat)-WORLD_HALF);
            glVertex3f((GLfloat)WORLD_HALF, 2.7f, (GLfloat)-WORLD_HALF);
            glVertex3f((GLfloat)WORLD_HALF, 2.7f, (GLfloat)WORLD_HALF);
            glVertex3f((GLfloat)-WORLD_HALF, 2.7f, (GLfloat)WORLD_HALF);
            glEnd();
            glDepthMask(GL_TRUE);
            glDisable(GL_BLEND);
            glEnable(GL_TEXTURE_2D);
            glColor4f(1.0f, 1.0f, 1.0f, 1.0f);
        }
        SDL_GL_SwapWindow(window);
        frames++;
        if (now - lastReport > 2000) {
            printf("fps %u pos %d %d %d block %d\n", frames * 1000 / (now - lastReport), (int)player.x, (int)player.y, (int)player.z, selected);
            frames = 0;
            lastReport = now;
        }
        if (now - lastSave > 15000) {
            sv_save_write(savePath, &world, &player);
            lastSave = now;
        }
    }

    sv_save_write(savePath, &world, &player);
    printf("saved to %s\n", savePath);
    SDL_GL_DeleteContext(gl);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
