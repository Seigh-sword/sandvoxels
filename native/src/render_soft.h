#ifndef SANDVOXEL_RENDER_SOFT_H
#define SANDVOXEL_RENDER_SOFT_H

#include "sandvoxel_core.h"

void sv_render_atlas_rgba(uint8_t * out);
void sv_render_frame(World * world, PlayerState * player, uint8_t * atlas, uint8_t * frame, int width, int height, double fov, double hour, int weather);

#endif
