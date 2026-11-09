import { strToU8, zipSync } from 'fflate';
import { musicResources2012, musicScript } from './build-2012.js';
import { titleMapInfo, titleResources, titleScript } from './title.js';

// Names, sky, music and map order are taken from the 2024 UMAPINFO.
// Last value points to the same underlying map in the 2012 ordering.
const maps = [
  ['Attack', 'SKYM1', 'DM2INT', 1],
  ['Canyon', 'SKYM1', 'E2M2', 2],
  ['The Catwalk', 'SKYM1', 'THE_DA', 3],
  ['The Fistula', 'SKYM1', 'E1M6', 5],
  ['The Combine', 'SKYM1', 'DEAD', 4],
  ['Subspace', 'SKYM1', 'STALKS', 9],
  ['Paradox', 'SKYM1', 'IN_CIT', 8],
  ['Subterra', 'SKYM1', 'DDTBLU', 10],
  ['The Garrison', 'SKYM1', 'E3M3', 6],
  ['Black Tower', 'SKY3', 'VICTOR', 19],
  ["Virgil's Lead", 'SKYM2', 'E1M5', 12],
  ["Minos' Judgement", 'SKYM2', 'E2M6', 13],
  ['Nessus', 'SKYM2', 'ROMERO', 16],
  ['Geryon', 'SKYM2', 'E2M7', 17],
  ['Vesperas', 'SKYM2', 'E1M8', 18],
  ['Titan Manor', 'SKYM3', 'MESSAG', 7],
  ['Trapped on Titan', 'SKYM3', 'E1M7', 11],
  ['The Express Elevator to Hell', 'SKYM3', 'E3M1', 20],
  ['Bloodsea Keep', 'SKYM3', 'TENSE', 14],
  ["Mephisto's Mausoleum", 'SKYM3', 'READ_M', 15],
  ['Bad Dream', 'SKYM3', 'OPENIN', 21],
] as const;

export const musicResources2024 = maps.map((map) => musicResources2012[map[3] - 1]);

export function mapinfo2024(pistolStart: boolean): string {
  const lines = [
    'gameinfo { addEventHandlers = "ML2024MusicOverride", "MLTitleAnimation" }',
    titleMapInfo,
    'clearepisodes',
    'episode MAP01 { name = "DOOM + DOOM II (2024)" }',
    'cluster 2024',
    '{',
    '  flat = "CEIL4_2"',
    '  music = "D_READ_M"',
    '  exittext = lookup, "ML2024_FINAL"',
    '}',
    '',
  ];
  for (let index = 0; index < maps.length; index++) {
    const number = index + 1;
    const map = `MAP${String(number).padStart(2, '0')}`;
    const next =
      number === 20
        ? '"EndGameC"'
        : number === 21
          ? '"MAP19"'
          : `"MAP${String(number + 1).padStart(2, '0')}"`;
    lines.push(`map ${map} "${maps[index][0]}"`, '{', `  next = ${next}`);
    if (number === 18) lines.push('  secretnext = "MAP21"');
    lines.push(
      '  cluster = 2024',
      `  sky1 = "${maps[index][1]}"`,
      `  music = "D_${maps[index][2]}"`,
    );
    if (number === 19 || number === 20) lines.push('  map07special');
    if (number === 20) lines.push('  needclustertext');
    if (pistolStart && number !== 1 && number !== 21)
      lines.push('  resetinventory', '  resethealth');
    lines.push('}', '');
  }
  return lines.join('\n');
}

export function build2024Archive(pistolStart: boolean): Uint8Array {
  const language =
    '[enu default]\nML2024_FINAL = "You have assaulted and triumphed over the\\nmost vicious realms that the demented minds\\nof our designers could devise.\\n\\nThe havoc you left behind you as you\\nsmashed your way through the Master\\nLevels is mute tribute to your prowess.\\n\\nYou have earned the title of\\nMaster of Destruction.";\n';
  return zipSync(
    {
      MAPINFO: strToU8(mapinfo2024(pistolStart)),
      ZSCRIPT: strToU8(musicScript(musicResources2024, 'ML2024MusicOverride') + titleScript),
      LANGUAGE: strToU8(language),
      ...titleResources(),
    },
    { level: 6, mtime: new Date('2000-01-01T00:00:00Z') },
  );
}
