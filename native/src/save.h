#ifndef SANDVOXEL_SAVE_H
#define SANDVOXEL_SAVE_H

#include "sandvoxel_core.h"

int sv_save_write(const char * path, World * world, PlayerState * player);
int sv_save_read(const char * path, World * world, PlayerState * player);

#endif
