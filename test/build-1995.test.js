import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strFromU8, unzipSync } from 'fflate';
import { archive1995, build1995, mapinfo1995, menu1995, originalMap } from '../dist/build-1995.js';
import { writeWad } from '../dist/wad.js';

const lump = (name, data = '') => ({ name, data: Buffer.from(data) });
const names = ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'];
const map = name => [lump(name), ...names.map(n => lump(n, `${name}-${n}`))];
const wad = lumps => writeWad({ type: 'PWAD', lumps });

test('partial 1995 metadata preserves original slots and secret Teeth exit', () => {
  const attack = originalMap('ATTACK.WAD', wad(map('MAP01')));
  const teeth = originalMap('TEETH.WAD', wad([...map('MAP31'), ...map('MAP32')]));
  const combined = originalMap('COMBINE.WAD', wad([...map('MAP01'), lump('RSKY1', 'sky')]));
  const text = mapinfo1995([attack, combined, teeth]);
  assert.match(text, /episode ATTACK \{ name = "ATTACK.WAD" \}/);
  assert.match(text, /map TEETH[^]*?secretnext = "BADDREAM"/);
  assert.match(text, /map BADDREAM[^]*?music = "D_ULTIMA"/);
  assert.equal(combined.sky, 'MLCOMBIN');
  const archive = unzipSync(archive1995([attack, combined, teeth]));
  assert.deepEqual(Buffer.from(archive['textures/MLCOMBIN.lmp']), Buffer.from('sky'));
  assert.match(strFromU8(archive.ZSCRIPT), /BADDREAM.*MLBDREAM/);
  const menu = strFromU8(archive.MENUDEF);
  assert.match(menu, /Title "Master Levels \(1995\)"/);
  assert.match(menu, /Submenu "ATTACK.WAD", "SkillMenu", 0/);
  assert.match(menu, /Submenu "TEETH.WAD", "SkillMenu", 2/);
  assert.doesNotMatch(menu, /BADDREAM/);
});

test('full original list preserves menu order and episode indexes', () => {
  const ids = ['ATTACK', 'BLACKTWR', 'BLOODSEA', 'CANYON', 'CATWALK', 'COMBINE', 'FISTULA', 'GARRISON', 'GERYON', 'MANOR', 'MEPHISTO', 'MINOS', 'NESSUS', 'PARADOX', 'SUBSPACE', 'SUBTERRA', 'TEETH', 'TTRAP', 'VESPERAS', 'VIRGIL'];
  const menu = menu1995(ids.map(id => ({ id })));
  const entries = [...menu.matchAll(/Submenu "([A-Z]+)\.WAD", "SkillMenu", (\d+)/g)];
  assert.deepEqual(entries.map(entry => entry[1]), ids);
  assert.deepEqual(entries.map(entry => Number(entry[2])), ids.map((_, index) => index));
});

test('MANOR and TTRAP preserve the 1024-wide four-patch sky texture', () => {
  const manor = originalMap('MANOR.WAD', wad([...map('MAP01'), lump('STARS', 'stars')]));
  const trap = originalMap('TTRAP.WAD', wad([...map('MAP01'), lump('STARS', 'other')]));
  const archive = unzipSync(archive1995([manor, trap]));
  assert.deepEqual(Buffer.from(archive['patches/MLMANOR.lmp']), Buffer.from('stars'));
  assert.deepEqual(Buffer.from(archive['patches/MLTTRAP.lmp']), Buffer.from('other'));
  const textures = strFromU8(archive.TEXTURES);
  assert.match(textures, /Texture MLMANOR, 1024, 128/);
  assert.match(textures, /Patch MLMANOR, 768, 0/);
  assert.match(textures, /Texture MLTTRAP, 1024, 128/);
  assert.equal((textures.match(/Patch ML(?:MANOR|TTRAP)/g) || []).length, 8);
  assert.match(textures, /Texture FIRWARP/);
});

test('1995 copies partial WAD set and protects existing data directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-1995-'));
  try {
    const source = join(dir, 'source.wad');
    const sourceData = wad(map('MAP01'));
    await writeFile(source, sourceData);
    const match = { path: source, explicit: true, file: { name: 'ATTACK.WAD', edition: '1995', size: sourceData.length } };
    const output = join(dir, 'out.pk3');
    const dataDir = await build1995([match], output, true, false);
    assert.deepEqual(await readFile(join(dataDir, 'maps', 'ATTACK.wad')), sourceData);
    assert.deepEqual(await readFile(source), sourceData);
    assert.equal(await build1995([match], output, true, false), dataDir);
    const archive = await readFile(output);
    await writeFile(output, 'old adapter');
    await assert.rejects(build1995([match], output, true, false), /already exists/);
    assert.equal(await readFile(output, 'utf8'), 'old adapter');
    assert.equal(await build1995([match], output, true, true), dataDir);
    assert.deepEqual(await readFile(output), archive);
    await writeFile(join(dataDir, 'maps', 'extra.wad'), 'user data');
    await assert.rejects(build1995([match], output, true, true), /does not match/);
    assert.deepEqual(await readFile(join(dataDir, 'maps', 'ATTACK.wad')), sourceData);
    assert.equal(await readFile(join(dataDir, 'maps', 'extra.wad'), 'utf8'), 'user data');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('1995 can link WADs without copying', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-1995-'));
  try {
    const source = join(dir, 'source.wad');
    const data = wad(map('MAP01'));
    await writeFile(source, data);
    const match = { path: source, explicit: true, file: { name: 'ATTACK.WAD', edition: '1995', size: data.length } };
    const dataDir = await build1995([match], join(dir, 'out.pk3'), false, false);
    assert.ok((await lstat(join(dataDir, 'maps', 'ATTACK.wad'))).isSymbolicLink());
    assert.deepEqual(await readFile(join(dataDir, 'maps', 'ATTACK.wad')), data);
    assert.equal(await build1995([match], join(dir, 'out.pk3'), false, false), dataDir);
    await rm(join(dir, 'out.pk3'));
    assert.equal(await build1995([match], join(dir, 'out.pk3'), false, false), dataDir);
    assert.deepEqual(await readFile(join(dataDir, 'maps', 'ATTACK.wad')), data);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
