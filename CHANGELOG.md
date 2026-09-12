# Changelog

All notable changes to Sandvoxel are documented here. The format follows Keep a Changelog, and the project adheres to semantic versioning.

## 1.1.0 - Pixel Edition

### Added

- Pixel identity: Press Start 2P and VT323 bitmap fonts, a hand-drawn 51 icon pixel set, pixel logo cube, chunky hard-shadow interface, scanline overlay, and pixel-art biome previews.
- Portable core in `src/core/` holding terrain generation, chunk meshing, physics, raycasting, and the texture atlas rasterizer, shared by every edition.
- `native/tools/ts2c.mjs`, a TypeScript-to-C compiler on the TypeScript compiler API, generating `native/generated/sandvoxel_core.c` and its header.
- Native SDL2 plus OpenGL edition with keyboard, mouse, chunked rendering, water plane, and binary saves.
- Native headless edition with a dependency-free software voxel raycaster that writes PPM frames.
- Differential test proving the C core and the TypeScript core produce identical results.
- GitHub Actions workflows for CI and for native release builds across Linux, Windows, and macOS on amd64, arm64, and RISC-V.
- Cloudflare Pages configuration: `wrangler.toml`, `_headers`, `_redirects`, web manifest, icons, Open Graph metadata, and a manual deploy workflow.
- Mobile support: locked viewport, touch-action handling, safe-area insets, adaptive touch pad and action buttons.
- ISC license, README, CONTRIBUTING, SECURITY, and CODE_OF_CONDUCT.

### Changed

- Renamed the game from Blockhaven to Sandvoxel across the interface, storage keys, export files, and tests.
- Browser renderer now draws the core meshes with WebGL at a reduced internal resolution, upscaled with nearest-neighbour filtering for the pixel look.
- Grass block sides use exactly the dirt palette, fixing the mismatched dirt colour.

### Fixed

- World identifiers fell back to a safe generator where `crypto.randomUUID` is unavailable.
- Engine timers initialised on the first frame, causing an immediate save and a zero FPS readout.
- Keyboard preventDefault blocked Space and arrow activation of focused modal controls while paused.
- Single-file builds referenced public images by URL and broke when served standalone.
- Rename dialog input was controlled without a change handler and submitted the stale name.
- Chunk index buffers used a type WebGL cannot draw; terrain now renders.

## 1.0.0 - First Release

- Initial voxel sandbox with Forest, Desert, and Alpine biomes, Creative and Explorer modes, local saves, world export and import, and desktop plus touch controls.
