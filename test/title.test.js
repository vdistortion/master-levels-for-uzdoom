import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWad } from '../dist/wad.js';
import { titleResources, titleScript } from '../dist/title.js';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { archive1995 } from '../dist/build-1995.js';
import { build2012Archive } from '../dist/build-2012.js';
import { build2024Archive } from '../dist/build-2024.js';

test('title packages the supplied background and keeps animation on separate layers', () => {
  const resources = titleResources();
  const lumps = readWad(Buffer.from(resources['maps/TITLEMAP.wad'])).lumps;
  assert.deepEqual(
    lumps.map((lump) => lump.name),
    ['TITLEMAP', 'TEXTMAP', 'ENDMAP'],
  );
  assert.match(lumps[1].data.toString(), /texturemiddle = "MLBACK"/);
  assert.match(lumps[1].data.toString(), /texturemiddle = "FIRWARP"/);
  const image = Buffer.from(resources['patches/MLBGIMG.webp']);
  assert.deepEqual(
    image,
    readFileSync(new URL('../assets/biomechanical-tile.webp', import.meta.url)),
  );
  assert.equal(image.subarray(0, 4).toString(), 'RIFF');
  assert.equal(image.subarray(8, 12).toString(), 'WEBP');
  assert.deepEqual(
    Buffer.from(resources['graphics/M_TITLE.webp']),
    readFileSync(new URL('../assets/ml-title.webp', import.meta.url)),
  );
  assert.match(
    Buffer.from(resources.TEXTURES).toString(),
    /Graphic M_DOOM, 425, 139[^]*?XScale 3\.3[^]*?YScale 3\.3[^]*?Offset -10, -61[^]*?Patch M_TITLE, 0, 0 \{ Blend "#ff8000", 0\.5 \}/,
  );
  assert.ok(Math.abs((139 + 25) / 2.7 - (139 + 61) / 3.3) < 0.15);
  assert.match(titleScript, /AddTextureYOffset/);
  assert.match(titleScript, /for \(int i = 0; i < 6; i\+\+\) level\.Sides\[i\]\.AddTextureYOffset/);
  assert.match(titleScript, /AddTextureYOffset\(Side.mid, 52\.0 \/ 64\)/);
  assert.match(lumps[1].data.toString(), /vertex \{ x = 192; y = 1024; \}/);
  assert.match(lumps[1].data.toString(), /vertex \{ x = 192; y = -1024; \}/);
  assert.match(lumps[1].data.toString(), /thing \{ x = 64; y = 0;/);
  assert.match(lumps[1].data.toString(), /heightceiling = 408/);
  assert.match(titleScript, /Sides\[6\]\.SetSpecialColor/);
  assert.doesNotMatch(titleScript, /Sides\[3\]\.SetSpecialColor/);
  assert.match(titleScript, /color glowColor = color\(192, 96, 0\)/);
  assert.doesNotMatch(titleScript, /int phase/);
  assert.match(titleScript, /tick < 35[^]*tick < 238[^]*tick < 273[^]*tick < 543[^]*tick < 578/);
  assert.match(titleScript, /level\.Sectors\[sector\]\.lightlevel = int\(light \* 255\)/);
  assert.equal((lumps[1].data.toString().match(/lightlevel = 0/g) || []).length, 3);
  assert.equal((lumps[1].data.toString().match(/heightfloor = -200/g) || []).length, 2);
  assert.match(lumps[1].data.toString(), /vertex \{ x = 96; y = 64; \}/);
  assert.match(titleScript, /sector < 3/);
  assert.match(Buffer.from(resources.TEXTURES).toString(), /Texture FIRWARP, 256, 256/);
  assert.match(
    Buffer.from(resources.TEXTURES).toString(),
    /Texture MLBACK, 1024, 512[^]*?XScale 4\.0[^]*?YScale 4\.0[^]*?Patch MLBGIMG/,
  );
  assert.equal(
    (
      Buffer.from(resources.TEXTURES)
        .toString()
        .match(/Patch W65B_1/g) || []
    ).length,
    4,
  );
  assert.equal(
    (
      Buffer.from(resources.TEXTURES)
        .toString()
        .match(/Translation "Desaturate", 31/g) || []
    ).length,
    4,
  );
  assert.equal(Buffer.from(resources.ANIMDEFS).toString(), 'WARP TEXTURE FIRWARP\n');
  assert.equal(resources['textures/MLGLOW.png'], undefined);
});

test('all editions include the exact supplied background', () => {
  const original = readFileSync(new URL('../assets/biomechanical-tile.webp', import.meta.url));
  const logo = readFileSync(new URL('../assets/ml-title.webp', import.meta.url));
  for (const archive of [archive1995([]), build2012Archive(false), build2024Archive(false)]) {
    const files = unzipSync(archive);
    assert.deepEqual(Buffer.from(files['patches/MLBGIMG.webp']), original);
    assert.deepEqual(Buffer.from(files['graphics/M_TITLE.webp']), logo);
  }
});
