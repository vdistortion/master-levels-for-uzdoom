import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import {
  build2012Archive,
  mapinfo2012,
  musicResources2012,
  musicScript2012,
  writeArchive,
} from '../dist/build-2012.js';

test('2012 adapter contains metadata and script, not maps or music', () => {
  const archive = unzipSync(build2012Archive(false));
  assert.deepEqual(Object.keys(archive), [
    'MAPINFO',
    'ZSCRIPT',
    'LANGUAGE',
    'maps/TITLEMAP.wad',
    'patches/MLBGIMG.webp',
    'graphics/M_TITLE.webp',
    'TEXTURES',
    'ANIMDEFS',
  ]);
  const text = strFromU8(archive.MAPINFO);
  assert.equal((text.match(/^map MAP\d\d /gm) || []).length, 21);
  assert.match(text, /map MAP20[^]*?next = "MAP21"\s+secretnext = "MAP21"/);
  assert.match(text, /map MAP21[^]*?next = "EndGameC"/);
  assert.equal((text.match(/cluster = 2012/g) || []).length, 21);
  assert.match(text, /flat = "SLIME16"/);
  const sections = [...text.matchAll(/map (MAP\d\d) [^]*?\n\}/g)];
  assert.deepEqual(
    sections.filter((section) => section[0].includes('map07special')).map((section) => section[1]),
    ['MAP14', 'MAP15'],
  );
  assert.match(strFromU8(archive.LANGUAGE), /CONGRATULATIONS YOU HAVE FINISHED/);
  assert.doesNotMatch(text, /resetinventory/);
  assert.deepEqual(build2012Archive(false), build2012Archive(false));
});

test('music resource mapping is unique, WAD-compatible and covers all 21 maps', () => {
  assert.equal(musicResources2012.length, 21);
  assert.equal(new Set(musicResources2012).size, 21);
  assert.ok(musicResources2012.every((name) => /^[A-Z0-9]{1,8}$/.test(name)));
  const script = musicScript2012();
  assert.match(script, /MAP20.*MLTEETH/);
  assert.match(script, /MAP21.*MLBDREAM/);
  assert.match(script, /GetLumpFullName\(lump\)/);
});

test('pistol start skips first map and Bad Dream', () => {
  const text = mapinfo2012(true);
  const sections = [...text.matchAll(/map (MAP\d\d) [^]*?\n\}/g)];
  assert.equal(sections.length, 21);
  for (const [, name, ...rest] of sections) {
    void rest;
    const section = sections.find((match) => match[1] === name)[0];
    assert.equal(section.includes('resetinventory'), name !== 'MAP01' && name !== 'MAP21');
    assert.equal(section.includes('resethealth'), name !== 'MAP01' && name !== 'MAP21');
  }
});

test('output refuses source and existing files unless explicitly replaced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-build-'));
  try {
    const source = join(dir, 'source.wad');
    const output = join(dir, 'out.pk3');
    await writeFile(source, 'source');
    await writeFile(output, 'original');
    await assert.rejects(writeArchive(source, Buffer.from('new'), source, true), /source WAD/);
    await assert.rejects(writeArchive(output, Buffer.from('new'), source), /already exists/);
    assert.equal(await readFile(output, 'utf8'), 'original');
    await writeArchive(output, Buffer.from('new'), source, true);
    assert.equal(await readFile(output, 'utf8'), 'new');
    assert.equal(await readFile(source, 'utf8'), 'source');
    const fresh = join(dir, 'fresh.pk3');
    await writeArchive(fresh, Buffer.from('fresh'), source);
    await writeArchive(fresh, Buffer.from('fresh'), source);
    assert.equal(await readFile(fresh, 'utf8'), 'fresh');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
