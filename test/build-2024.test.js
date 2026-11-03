import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { build2024Archive, mapinfo2024, musicResources2024 } from '../dist/build-2024.js';

test('2024 adapter preserves route and resources without bundling maps', () => {
  const archive = unzipSync(build2024Archive(false));
  assert.deepEqual(Object.keys(archive), ['MAPINFO', 'ZSCRIPT', 'LANGUAGE', 'maps/TITLEMAP.wad', 'patches/MLBGIMG.webp', 'graphics/M_TITLE.webp', 'TEXTURES', 'ANIMDEFS']);
  const text = strFromU8(archive.MAPINFO);
  const sections = new Map([...text.matchAll(/map (MAP\d\d) [^]*?\n\}/g)].map(match => [match[1], match[0]]));
  assert.equal(sections.size, 21);
  assert.match(sections.get('MAP04'), /The Fistula/);
  assert.match(sections.get('MAP18'), /next = "MAP19"\s+secretnext = "MAP21"/);
  assert.match(sections.get('MAP21'), /next = "MAP19"/);
  assert.match(sections.get('MAP20'), /next = "EndGameC"/);
  assert.match(sections.get('MAP19'), /map07special/);
  assert.match(sections.get('MAP20'), /map07special/);
  assert.doesNotMatch(sections.get('MAP07'), /map07special/);
  assert.equal(new Set(musicResources2024).size, 21);
  assert.equal(musicResources2024[3], 'MLFISTUL');
  assert.equal(musicResources2024[17], 'MLTEETH');
  assert.equal(musicResources2024[20], 'MLBDREAM');
});

test('2024 pistol start does not reset on Bad Dream', () => {
  const sections = new Map([...mapinfo2024(true).matchAll(/map (MAP\d\d) [^]*?\n\}/g)].map(match => [match[1], match[0]]));
  for (const [name, section] of sections) {
    assert.equal(section.includes('resetinventory'), name !== 'MAP01' && name !== 'MAP21');
    assert.equal(section.includes('resethealth'), name !== 'MAP01' && name !== 'MAP21');
  }
});
