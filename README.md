# Master Levels for UZDoom

A CLI tool for finding Master Levels WADs and building adapters for UZDoom. It supports the original 1995 release, Doom Classic Complete (2012), and DOOM + DOOM II (2024).

The project is in early development. The adapters are experimental. Linux engine smoke tests cover map loading, selected transitions, boss actions, music, ending text, and the title screen. Full gameplay verification remains; Windows runtime testing is deferred.

## Requirements

- UZDoom and a Doom II IWAD
- A supported copy of Master Levels
- Node.js 22 or newer; supported LTS lines are 22, 24, and 26

Source WADs are read-only. Game files are not included.

## Getting started

```sh
npm install
npm run build

# Find WADs
node dist/cli.js scan --edition 1995
node dist/cli.js scan --source /path/to/wads --no-defaults --json

# Build an adapter for one edition
node dist/cli.js build --edition 1995 --output /path/to/master-levels-1995.pk3
node dist/cli.js build --edition 2012 --output /path/to/master-levels-2012.pk3
node dist/cli.js build --edition 2024 --output /path/to/master-levels-2024.pk3
```

The output directory must already exist. Run `node dist/cli.js --help` or `node dist/cli.js build --help` for options.

By default, the scan checks standard UZDoom and Steam locations, UZDoom's `IWADSearch.Directories` and `FileSearch.Directories`, and Steam libraries listed in `libraryfolders.vdf`. Unresolved UZDoom variables such as `$PROGDIR` are skipped. Unknown hashes are reported rather than assumed to be damaged files.

## Configuration

Pass a JSON file with `--config path/to/config.json`:

```json
{
  "sources": ["./wads"],
  "edition": "1995",
  "includeDefaults": false
}
```

The config also accepts `output`, `pistolStart`, `copy`, and `force`. Paths in the config are relative to the config file; command-line paths are relative to the working directory. Command-line options take precedence. Repeated `--source` options replace config sources.

Use `--pistol-start` to reset health and inventory between campaign maps, or `--continuous` to keep them. Entering Bad Dream does not trigger a reset.

An identical output is reused. A different existing PK3 is preserved unless `--force` or `"force": true` is set; `--no-force` overrides the config. A source WAD cannot be used as the output.

## Loading the adapter

For **2012 and 2024**, load the selected Master Levels WAD before the generated PK3. Maps remain in the source WAD; they are not copied into the adapter.

For **1995**, the builder accepts any supported subset of the original WADs and creates a scrollable alphabetical menu. It also creates a sibling directory named after the output with `-data` appended. Load that directory before the PK3:

```sh
uzdoom -iwad /path/to/DOOM2.WAD \
  -file /path/to/master-levels-1995-data /path/to/master-levels-1995.pk3
```

On Linux, individual WADs are linked by default; use `--copy` or `"copy": true` to copy them instead. Windows uses copies by default. Teeth is split locally in both modes. A matching data directory is reused after checking its files and links. A different or modified data directory is never replaced, even with `--force`; choose a different output path.

The 1995 adapter copies required sky textures from the source WADs. Do not redistribute the generated PK3 or data directory.

Use `build --json` for selected sources, missing 1995 WAD names, ordered load files, and UZDoom arguments. `DOOM2.WAD` in the output is a placeholder: supply its actual path if UZDoom cannot find it. Pass the arguments as an array to a process launcher rather than concatenating them into a shell command.

## Music

Optional music can be loaded after the adapter as WAD lumps or files in the root of a PK3. Use these names, with the audio extension for PK3 files (for example, `MLATTACK.ogg`):

```text
MLATTACK  MLCANYON  MLCATWLK  MLCOMBIN  MLFISTUL  MLGARRIS  MLMANOR
MLPARADO  MLSUBSPC  MLSUBTER  MLTTRAP   MLVIRGIL  MLMINOS   MLBLOODS
MLMEPHIS  MLNESSUS  MLGERYON  MLVESPER  MLBLACKT  MLTEETH   MLBDREAM
```

Maps without a replacement use the edition's default music.

## Title screen

The scrolling background is `assets/biomechanical-tile.webp`. The separate `FIRWARP` layer uses the `W65B_1` patch from the Doom II IWAD; that patch is not copied into the adapter. The menu logo is `assets/ml-title.webp`.

The logo's origin and redistribution rights have not been verified. Do not publish it or archives containing it until those rights are clarified.

## Tests

```sh
npm test
```

CI runs the tests on Windows and Linux with Node.js 22, 24, and 26. Game resources and generated game archives are not uploaded.
