# Contributing to Sandvoxel

Thanks for wanting to help. Sandvoxel is small on purpose, so the bar for changes is simple: keep the pixel identity, keep the core portable, and keep the checks green.

## Getting set up

```
npm ci
npm run dev
```

Useful checks before opening a pull request:

```
npm run typecheck
npm run native:test
npm run build
```

`npm run native:test` transpiles the TypeScript core to C and diffs the C output against the Node output. If you touch anything under `src/core/`, that test is the contract: both compilers must agree bit for bit.

## Ground rules

- No comments and no emoji in source files. Names and README prose carry the explanation.
- Code under `src/core/` must stay in the subset understood by `native/tools/ts2c.mjs`: no strings, no closures over mutable state, no DOM, no library calls outside the supported `Math` surface.
- UI stays pixel: bitmap fonts, hard shadows, square corners, nearest-neighbour images. No smooth gradients, no rounded corners, no vector icon packs.
- Gameplay changes should land in the core so browser and native editions get them together.
- Storage keys live under the `sandvoxel-` prefix; do not break existing saves without a migration.

## Pull requests

Keep them focused. Describe what changed and why, include screenshots for UI work, and make sure CI passes on your branch. A maintainer will review when they can; small clear changes merge fastest.

## Reporting bugs

Open an issue with the edition (browser, native SDL2, native headless), the operating system, the world seed, and what you expected versus what happened. Saves exported from the world menu make bugs much easier to reproduce.
