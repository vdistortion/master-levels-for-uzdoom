import { randomUUID } from 'node:crypto';
import { open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { titleMapInfo, titleResources, titleScript } from './title.js';

const maps = [
  ['Attack', 'RUNNIN'],
  ['Canyon', 'STALKS'],
  ['The Catwalk', 'COUNTD'],
  ['The Combine', 'BETWEE'],
  ['The Fistula', 'DOOM'],
  ['The Garrison', 'THE_DA'],
  ['Titan Manor', 'SHAWN'],
  ['Paradox', 'DDTBLU'],
  ['Subspace', 'IN_CIT'],
  ['Subterra', 'DEAD'],
  ['Trapped on Titan', 'STLKS2'],
  ["Virgil's Lead", 'THEDA2'],
  ["Minos' Judgement", 'DOOM2'],
  ['Bloodsea Keep', 'DDTBL2'],
  ["Mephisto's Maosoleum", 'RUNNI2'],
  ['Nessus', 'DEAD2'],
  ['Geryon', 'STLKS3'],
  ['Vesperas', 'ROMERO'],
  ['Black Tower', 'SHAWN2'],
  ['The Express Elevator to Hell', 'MESSAG'],
  ['Bad Dream', 'COUNT2'],
] as const;

// Stable eight-character names shared by music packs in WAD and PK3 formats.
export const musicResources2012 = [
  'MLATTACK',
  'MLCANYON',
  'MLCATWLK',
  'MLCOMBIN',
  'MLFISTUL',
  'MLGARRIS',
  'MLMANOR',
  'MLPARADO',
  'MLSUBSPC',
  'MLSUBTER',
  'MLTTRAP',
  'MLVIRGIL',
  'MLMINOS',
  'MLBLOODS',
  'MLMEPHIS',
  'MLNESSUS',
  'MLGERYON',
  'MLVESPER',
  'MLBLACKT',
  'MLTEETH',
  'MLBDREAM',
] as const;

export function musicScriptForMaps(
  maps: readonly (readonly [string, string])[],
  className: string,
): string {
  const mappings = maps.map(
    ([map, resource]) => `    if (level.MapName ~== "${map}") replacement = "${resource}";`,
  );
  return [
    'version "4.12"',
    `class ${className} : EventHandler`,
    '{',
    '  bool checkedMusic;',
    '  override void WorldLoaded(WorldEvent e) { checkedMusic = false; }',
    '  override void WorldTick()',
    '  {',
    '    if (checkedMusic) return;',
    '    checkedMusic = true;',
    '    String replacement = "";',
    ...mappings,
    '    if (replacement == "") return;',
    '    int lump = Wads.CheckNumForName(replacement, Wads.ns_global);',
    '    if (lump >= 0) S_ChangeMusic(Wads.GetLumpFullName(lump));',
    '  }',
    '}',
    '',
  ].join('\n');
}

export function musicScript(resources: readonly string[], className: string): string {
  return musicScriptForMaps(
    resources.map((resource, index) => [`MAP${String(index + 1).padStart(2, '0')}`, resource]),
    className,
  );
}

export function musicScript2012(): string {
  return musicScript(musicResources2012, 'ML2012MusicOverride');
}

export function mapinfo2012(pistolStart: boolean): string {
  const lines = [
    'gameinfo { addEventHandlers = "ML2012MusicOverride", "MLTitleAnimation" }',
    titleMapInfo,
    'clearepisodes',
    'episode MAP01 { name = "Classic Complete / PSN (2012)" }',
    'cluster 2012',
    '{',
    '  flat = "SLIME16"',
    '  music = "D_READ_M"',
    '  exittext = lookup, "ML2012_FINAL"',
    '}',
    '',
  ];
  for (let index = 0; index < maps.length; index++) {
    const number = index + 1;
    const map = `MAP${String(number).padStart(2, '0')}`;
    const next = number === 21 ? '"EndGameC"' : `"MAP${String(number + 1).padStart(2, '0')}"`;
    const sky = number <= 11 ? 'SKY1' : number <= 20 ? 'SKY2' : 'SKY3';
    lines.push(`map ${map} "${maps[index][0]}"`, '{', `  next = ${next}`);
    if (number === 20) lines.push('  secretnext = "MAP21"');
    lines.push('  cluster = 2012', `  sky1 = "${sky}"`, `  music = "D_${maps[index][1]}"`);
    if (number === 14 || number === 15) lines.push('  map07special');
    if (number === 21) lines.push('  needclustertext');
    if (pistolStart && number !== 1 && number !== 21)
      lines.push('  resetinventory', '  resethealth');
    lines.push('}', '');
  }
  return lines.join('\n');
}

export function build2012Archive(pistolStart: boolean): Uint8Array {
  const language =
    '[enu default]\nML2012_FINAL = "CONGRATULATIONS YOU HAVE FINISHED... \\n\\nTHE MASTER LEVELS\\n";\n';
  return zipSync(
    {
      MAPINFO: strToU8(mapinfo2012(pistolStart)),
      ZSCRIPT: strToU8(musicScript2012() + titleScript),
      LANGUAGE: strToU8(language),
      ...titleResources(),
    },
    { level: 6, mtime: new Date('2000-01-01T00:00:00Z') },
  );
}

/** Never overwrite an existing path unless explicitly requested. */
export async function writeArchive(
  outputPath: string,
  data: Uint8Array,
  sourcePath: string,
  force = false,
): Promise<void> {
  const output = resolve(outputPath);
  const parent = await realpath(dirname(output));
  const source = await realpath(sourcePath);
  if (resolve(parent, basename(output)) === source)
    throw new Error('Output must not overwrite the source WAD');
  try {
    const existing = await stat(output);
    if (!existing.isFile()) throw new Error('Output already exists and is not a regular file');
    if ((await realpath(output)) === source)
      throw new Error('Output must not overwrite the source WAD');
    if ((await readFile(output)).equals(Buffer.from(data))) return;
    if (!force) throw new Error('Output already exists; use --force to replace it');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temp = resolve(parent, `.${basename(output)}.${randomUUID()}.tmp`);
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(data);
    } finally {
      await handle.close();
    }
    if (force) await rename(temp, output);
    else {
      // link is atomic and fails if another process created the destination.
      const { link } = await import('node:fs/promises');
      await link(temp, output);
      await rm(temp);
    }
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
