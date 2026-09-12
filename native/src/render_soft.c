#include "render_soft.h"

#include <math.h>

void sv_render_atlas_rgba(uint8_t * out) {
    sv_renderAtlas(out);
}

static void sky_color(int biome, double * r, double * g, double * b) {
    if (biome == BIOME_DESERT) {
        *r = 233; *g = 198; *b = 160;
    } else {
        *r = 176; *g = 213; *b = 223;
    }
}

static double frac(double value) {
    return value - floor(value);
}

void sv_render_frame(World * world, PlayerState * player, uint8_t * atlas, uint8_t * frame, int width, int height, double fov) {
    const double aspect = (double)width / (double)height;
    const double focal = 1.0 / tan(fov * 0.5 * 3.141592653589793 / 180.0);
    const double cosPitch = cos(player->pitch);
    const double dirX = -sin(player->yaw) * cosPitch;
    const double dirY = sin(player->pitch);
    const double dirZ = -cos(player->yaw) * cosPitch;
    const double rightX = cos(player->yaw);
    const double rightZ = -sin(player->yaw);
    const double upX = -sin(player->yaw) * (-sin(player->pitch));
    const double upY = cos(player->pitch);
    const double upZ = -cos(player->yaw) * (-sin(player->pitch));
    double sr, sg, sb;
    int px, py;
    sky_color(world->biome, &sr, &sg, &sb);
    for (py = 0; py < height; py++) {
        for (px = 0; px < width; px++) {
            const double nx = (2.0 * (px + 0.5) / width - 1.0) * aspect / focal;
            const double ny = (1.0 - 2.0 * (py + 0.5) / height) / focal;
            double rx = dirX + rightX * nx + upX * ny;
            double ry = dirY + upY * ny;
            double rz = dirZ + rightZ * nx + upZ * ny;
            const double len = sqrt(rx * rx + ry * ry + rz * rz);
            int mapX = (int)floor(player->x);
            int mapY = (int)floor(player->y);
            int mapZ = (int)floor(player->z);
            double r = sr, g = sg, b = sb;
            rx /= len; ry /= len; rz /= len;
            {
                const double dx = rx >= 0 ? 1.0 : -1.0;
                const double dy = ry >= 0 ? 1.0 : -1.0;
                const double dz = rz >= 0 ? 1.0 : -1.0;
                const double tdx = rx != 0.0 ? fabs(1.0 / rx) : 1e30;
                const double tdy = ry != 0.0 ? fabs(1.0 / ry) : 1e30;
                const double tdz = rz != 0.0 ? fabs(1.0 / rz) : 1e30;
                double tmx = rx != 0.0 ? ((rx > 0 ? (mapX + 1.0 - player->x) : (player->x - mapX)) * tdx) : 1e30;
                double tmy = ry != 0.0 ? ((ry > 0 ? (mapY + 1.0 - player->y) : (player->y - mapY)) * tdy) : 1e30;
                double tmz = rz != 0.0 ? ((rz > 0 ? (mapZ + 1.0 - player->z) : (player->z - mapZ)) * tdz) : 1e30;
                int face = -1;
                double dist = 0.0;
                int guard = 0;
                while (dist < 90.0 && guard < 512) {
                    int block;
                    guard++;
                    if (tmx < tmy && tmx < tmz) {
                        mapX += (int)dx; dist = tmx; tmx += tdx; face = rx > 0 ? FACE_NX : FACE_PX;
                    } else if (tmy < tmz) {
                        mapY += (int)dy; dist = tmy; tmy += tdy; face = ry > 0 ? FACE_NY : FACE_PY;
                    } else {
                        mapZ += (int)dz; dist = tmz; tmz += tdz; face = rz > 0 ? FACE_NZ : FACE_PZ;
                    }
                    block = World_getBlock(world, mapX, mapY, mapZ);
                    if (block != 0) {
                        const int tile = (int)sv_tileForBlock(block, face);
                        double u, v;
                        int tx, ty, ai;
                        double light = face == FACE_PY ? 1.0 : face == FACE_NY ? 0.5 : (face == FACE_PX || face == FACE_NX) ? 0.78 : 0.66;
                        double hitX = player->x + rx * dist;
                        double hitY = player->y + ry * dist;
                        double hitZ = player->z + rz * dist;
                        if (face == FACE_PX || face == FACE_NX) { u = frac(hitZ); v = 1.0 - frac(hitY); }
                        else if (face == FACE_PY || face == FACE_NY) { u = frac(hitX); v = frac(hitZ); }
                        else { u = frac(hitX); v = 1.0 - frac(hitY); }
                        tx = (int)(u * TILE_PX);
                        ty = (int)(v * TILE_PX);
                        if (tx > 15) tx = 15;
                        if (ty > 15) ty = 15;
                        ai = ((tile * TILE_PX + tx) + ty * ATLAS_PX) * 4;
                        {
                            const double fog = dist > 40.0 ? (dist - 40.0) / 50.0 : 0.0;
                            const double keep = fog > 1.0 ? 0.0 : 1.0 - fog;
                            r = atlas[ai] * light * keep + sr * (1.0 - keep);
                            g = atlas[ai + 1] * light * keep + sg * (1.0 - keep);
                            b = atlas[ai + 2] * light * keep + sb * (1.0 - keep);
                        }
                        break;
                    }
                }
            }
            {
                int index = (py * width + px) * 3;
                frame[index] = (uint8_t)(r > 255 ? 255 : r);
                frame[index + 1] = (uint8_t)(g > 255 ? 255 : g);
                frame[index + 2] = (uint8_t)(b > 255 ? 255 : b);
            }
        }
    }
}
