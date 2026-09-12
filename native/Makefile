CC ?= cc
CFLAGS ?= -O2 -std=c99 -Wall -Wno-unused-parameter
CORE = generated/sandvoxel_core.c
BUILD = build
UNAME := $(shell uname -s)

ifeq ($(UNAME),Darwin)
GL_LIBS := -framework OpenGL -framework Cocoa
else
ifeq ($(findstring MINGW,$(UNAME)),MINGW)
GL_LIBS := -lopengl32
else
GL_LIBS := -lGL
endif
endif

SDL_CFLAGS := $(shell sdl2-config --cflags 2>/dev/null || pkg-config --cflags sdl2 2>/dev/null)
SDL_LIBS := $(shell sdl2-config --libs 2>/dev/null || pkg-config --libs sdl2 2>/dev/null)

CORE_SRC = $(CORE) src/save.c src/render_soft.c

.PHONY: all soft sdl check test core clean

all: soft

core:
	node tools/ts2c.mjs

$(BUILD):
	mkdir -p $(BUILD)

soft: $(BUILD) $(CORE_SRC) src/main_headless.c
	$(CC) $(CFLAGS) -Igenerated -Isrc $(CORE_SRC) src/main_headless.c -o $(BUILD)/sandvoxel-headless -lm

sdl: $(BUILD) $(CORE_SRC) src/main_sdl.c
	@if [ -z "$(SDL_LIBS)" ]; then echo "SDL2 not found: install libsdl2-dev or set SDL_CFLAGS/SDL_LIBS"; exit 1; fi
	$(CC) $(CFLAGS) -Igenerated -Isrc $(SDL_CFLAGS) $(CORE_SRC) src/main_sdl.c -o $(BUILD)/sandvoxel $(SDL_LIBS) $(GL_LIBS) -lm

check: $(BUILD) $(CORE_SRC) src/core_check.c
	$(CC) $(CFLAGS) -Igenerated -Isrc $(CORE_SRC) src/core_check.c -o $(BUILD)/core-check -lm
	node tools/core-check.mjs > $(BUILD)/check-node.txt
	./$(BUILD)/core-check > $(BUILD)/check-c.txt
	diff -u $(BUILD)/check-node.txt $(BUILD)/check-c.txt && echo "core differential check passed"

test: check

clean:
	rm -rf $(BUILD)
