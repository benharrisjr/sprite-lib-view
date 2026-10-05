# Sprite Library Viewer

A cross-platform (macOS / Windows / Linux) desktop app for browsing a folder tree of sprite sheets.

- **Searchable grid** of every `png`, `jpg`, `gif`, `webp` and `bmp` under a folder (recursive, hidden folders skipped). Search matches file names and subfolder paths; filter by type, sort, resize thumbnails.
- **Copy Image** (pixels), **Copy File** (paste into Finder/Explorer), **Copy Path**.
- **Export…** copies files to a folder you choose (`name (1).png` on collisions; optional "Keep folders on export").
- **Multi-select** with Cmd/Ctrl-click, Shift-click, or Cmd/Ctrl+A, then copy or export in bulk.
- **Viewer** with pan/zoom, pixel grid, background swatches, and a **color picker** with a saved palette.

## Setup

Prerequisites:

- Node.js 18+ (`.nvmrc` pins 22 — run `nvm use`)
- Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Platform dependencies from https://tauri.app/start/prerequisites/ (Linux needs `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, etc.)

```sh
npm install
npm run tauri dev     # run in development
npm run tauri build   # build an installer for the current OS
```

Bundles are written to `src-tauri/target/release/bundle/`. Each OS must be built on that OS; the GitHub Actions workflow in `.github/workflows/build.yml` builds all three.

## Viewer controls

| Action | Input |
| --- | --- |
| Zoom | Mouse wheel / trackpad pinch (zooms toward cursor), `+` / `-` |
| Pan | Drag (hand tool), middle-drag, or hold Space and drag |
| Fit / Actual size | `0` or double-click / `1` |
| Hand / eyedropper tool | `H` / `I` |
| Pick a color | Click with the eyedropper, or Alt+click — copies hex |
| Pixel grid | `G` (shown at 8× and above) |
| Previous / next image | `←` / `→` |
| Copy image | Cmd/Ctrl+C |
| Close | `Esc` |

In the grid, Cmd/Ctrl+F focuses search and Esc clears the selection.

## Notes

- Animated GIFs show their first frame in the viewer.
- To regenerate app icons: `npx tauri icon app-icon.png`.
