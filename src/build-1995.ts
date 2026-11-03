import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { musicResources2012, musicScriptForMaps, writeArchive } from './build-2012.js';
import { readWad, splitTeeth } from './wad.js';
import type { Match } from './scan.js';
import { fireWarpTextures, titleMapInfo, titleResources, titleScript } from './title.js';

// Canonical WAD name -> original map slot and corresponding 2012 map identity.
const originals: Record<string, [number, number]> = {
  ATTACK: [1, 1], BLACKTWR: [25, 19], BLOODSEA: [7, 14], CANYON: [1, 2],
  CATWALK: [1, 3], COMBINE: [1, 4], FISTULA: [1, 5], GARRISON: [1, 6],
  GERYON: [8, 17], MANOR: [1, 7], MEPHISTO: [7, 15], MINOS: [5, 13],
  NESSUS: [7, 16], PARADOX: [1, 8], SUBSPACE: [1, 9], SUBTERRA: [1, 10],
  TEETH: [31, 20], TTRAP: [1, 11], VESPERAS: [9, 18], VIRGIL: [3, 12]
};
const doomMusic: Record<number, string> = { 1: 'RUNNIN', 3: 'COUNTD', 5: 'DOOM', 7: 'SHAWN', 8: 'DDTBLU', 9: 'IN_CIT', 25: 'AMPIE', 31: 'EVIL', 32: 'ULTIMA' };

export interface OriginalMap { id: string; slot: number; music: string; replacement: string; sky: string; skyData?: Buffer; tiledSky?: boolean }

export function originalMap(name: string, contents: Buffer): OriginalMap {
  const id = parse(name).name.toUpperCase();
  const entry = originals[id];
  if (!entry) throw new Error(`Unsupported original WAD: ${name}`);
  const [slot, identity] = entry;
  const wad = readWad(contents);
  if (wad.type !== 'PWAD' || !wad.lumps.some(lump => lump.name === `MAP${String(slot).padStart(2, '0')}`)) throw new Error(`Missing expected map in ${name}`);
  const sky = wad.lumps.find(lump => lump.name === 'RSKY1' || lump.name === 'STARS');
  return {
    id, slot, music: doomMusic[slot], replacement: musicResources2012[identity - 1],
    sky: sky ? musicResources2012[identity - 1] : slot <= 11 ? 'SKY1' : slot <= 20 ? 'SKY2' : 'SKY3',
    skyData: sky?.data, tiledSky: sky?.name === 'STARS'
  };
}

export function mapinfo1995(maps: OriginalMap[]): string {
  const lines = ['gameinfo { addEventHandlers = "ML1995MusicOverride", "MLTitleAnimation" }', titleMapInfo, 'clearepisodes'];
  for (const map of maps) lines.push(`episode ${map.id} { name = "${map.id}.WAD" }`);
  for (const map of maps) {
    lines.push('', `map ${map.id} "${map.id}.WAD"`, '{', '  next = endtitle', `  sky1 = "${map.sky}"`, `  music = "D_${map.music}"`);
    if (map.id === 'TEETH') lines.push('  secretnext = "BADDREAM"');
    if (map.slot === 7) lines.push('  map07special');
    lines.push('}');
  }
  if (maps.some(map => map.id === 'TEETH')) lines.push('', 'map BADDREAM "Bad Dream"', '{', '  next = endtitle', '  sky1 = "SKY3"', '  music = "D_ULTIMA"', '}');
  return `${lines.join('\n')}\n`;
}

export function menu1995(maps: OriginalMap[]): string {
  const entries = maps.map((map, index) => `  Submenu "${map.id}.WAD", "SkillMenu", ${index}`);
  return [
    'OptionMenu "EpisodeMenu"', '{', '  Class "ML1995EpisodeRedirect"', '}', '',
    'OptionMenu "ML1995Levels"', '{', '  Class "ML1995LevelList"',
    '  Title "Master Levels (1995)"', ...entries, '}', ''
  ].join('\n');
}

const menuScript1995 = `
class ML1995EpisodeRedirect : OptionMenu
{
  bool redirected;
  override void Ticker()
  {
    Super.Ticker();
    if (redirected) return;
    redirected = true;
    Menu.SetMenu('ML1995Levels');
  }
}

class ML1995LevelList : OptionMenu
{
  override void Init(Menu parent, OptionMenuDescriptor desc)
  {
    Super.Init(parent, desc);
    if (parent != null) mParentMenu = parent.mParentMenu;
  }
}
`;

export function archive1995(maps: OriginalMap[]): Uint8Array {
  const mappings: [string, string][] = maps.map(map => [map.id, map.replacement]);
  if (maps.some(map => map.id === 'TEETH')) mappings.push(['BADDREAM', 'MLBDREAM']);
  const files: Record<string, Uint8Array> = {
    MAPINFO: strToU8(mapinfo1995(maps)),
    MENUDEF: strToU8(menu1995(maps)),
    ZSCRIPT: strToU8(musicScriptForMaps(mappings, 'ML1995MusicOverride') + titleScript + menuScript1995),
    ...titleResources()
  };
  const textures: string[] = [];
  for (const map of maps) {
    if (!map.skyData) continue;
    if (map.tiledSky) {
      files[`patches/${map.sky}.lmp`] = map.skyData;
      textures.push(`Texture ${map.sky}, 1024, 128`, '{', ...[0, 256, 512, 768].map(x => `  Patch ${map.sky}, ${x}, 0`), '}', '');
    } else files[`textures/${map.sky}.lmp`] = map.skyData;
  }
  if (textures.length) files.TEXTURES = strToU8(fireWarpTextures + '\n' + textures.join('\n'));
  return zipSync(files, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') });
}

type PreparedSource = { match: Match; contents: Buffer; map: OriginalMap };

/** Reuse a map directory only when all files, link targets and entries match. */
async function existingMapsMatch(dataPath: string, sources: PreparedSource[], copy: boolean): Promise<boolean> {
  try {
    if (!(await lstat(dataPath)).isDirectory()) return false;
    const entries = await readdir(dataPath);
    if (entries.length !== 1 || entries[0] !== 'maps') return false;
    const mapsPath = join(dataPath, 'maps');
    if (!(await lstat(mapsPath)).isDirectory()) return false;
    const expected = new Map<string, { contents: Buffer; target?: string }>();
    for (const source of sources) {
      if (source.map.id === 'TEETH') {
        const split = splitTeeth(source.contents);
        expected.set('TEETH.wad', { contents: split.teeth });
        expected.set('BADDREAM.wad', { contents: split.badDream });
      } else {
        expected.set(`${source.map.id}.wad`, { contents: source.contents, target: copy ? undefined : resolve(source.match.path) });
      }
    }
    const names = await readdir(mapsPath);
    if (names.length !== expected.size || names.some(name => !expected.has(name))) return false;
    for (const [name, entry] of expected) {
      const path = join(mapsPath, name);
      const info = await lstat(path);
      if (entry.target) {
        if (!info.isSymbolicLink() || await realpath(path) !== await realpath(entry.target)) return false;
      } else if (!info.isFile() || info.isSymbolicLink()) return false;
      if (!(await readFile(path)).equals(entry.contents)) return false;
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Reuse matching map data, but never replace an existing data directory. */
export async function build1995(matches: Match[], outputPath: string, copy: boolean, force: boolean): Promise<string> {
  const output = resolve(outputPath);
  const dataPath = join(dirname(output), `${parse(basename(output)).name}-data`);
  const target = join(await realpath(dirname(output)), basename(output));
  for (const match of matches) if (await realpath(match.path) === target) throw new Error('Output must not overwrite a source WAD');
  try {
    const existing = await realpath(output);
    for (const match of matches) if (await realpath(match.path) === existing) throw new Error('Output must not overwrite a source WAD');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const sources = await Promise.all(matches.map(async match => {
    const contents = await readFile(match.path);
    return { match, contents, map: originalMap(match.file.name, contents) };
  }));
  if (!sources.length) throw new Error('No supported 1995 WADs found');
  const archive = archive1995(sources.map(source => source.map));
  try {
    await mkdir(dataPath); // Exclusive: never replace an existing directory, even with --force.
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (await existingMapsMatch(dataPath, sources, copy)) {
      await writeArchive(output, archive, sources[0].match.path, force);
      return dataPath;
    }
    throw new Error(`Data directory already exists and does not match this build: ${dataPath}`);
  }
  try {
    const mapsPath = join(dataPath, 'maps');
    await mkdir(mapsPath);
    for (const { match, contents, map } of sources) {
      if (map.id === 'TEETH') {
        const split = splitTeeth(contents);
        await writeFile(join(mapsPath, 'TEETH.wad'), split.teeth);
        await writeFile(join(mapsPath, 'BADDREAM.wad'), split.badDream);
      } else if (copy) await copyFile(match.path, join(mapsPath, `${map.id}.wad`));
      else await symlink(resolve(match.path), join(mapsPath, `${map.id}.wad`));
    }
    await writeArchive(output, archive, sources[0].match.path, force);
    return dataPath;
  } catch (error) {
    await rm(dataPath, { recursive: true, force: true });
    throw error;
  }
}
