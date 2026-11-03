import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWad, writeWad, splitTeeth } from '../dist/wad.js';

const names = ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'];
const lump = (name, value = '') => ({ name, data: Buffer.from(value) });
const map = name => [lump(name), ...names.map(n => lump(n, `${name}-${n}`))];

test('WAD read/write roundtrip preserves lump order and bytes', () => {
  const wad = { type: 'PWAD', lumps: [lump('TEST', 'data'), lump('EMPTY')] };
  assert.deepEqual(readWad(writeWad(wad)), wad);
});

test('invalid WAD directories and lump offsets are rejected', () => {
  assert.throws(() => readWad(Buffer.from('PWAD')), /header/);
  const invalidDirectory = Buffer.alloc(12);
  invalidDirectory.write('PWAD'); invalidDirectory.writeUInt32LE(1, 4); invalidDirectory.writeUInt32LE(12, 8);
  assert.throws(() => readWad(invalidDirectory), /directory/);
  const invalidLump = writeWad({ type: 'PWAD', lumps: [lump('TEST')] });
  invalidLump.writeUInt32LE(0xffffffff, 12);
  assert.throws(() => readWad(invalidLump), /lump/);
});

test('split Teeth preserves map data and unrelated resources', () => {
  const wad = { type: 'PWAD', lumps: [lump('BEFORE', 'a'), ...map('MAP31'), lump('BETWEEN', 'b'), ...map('MAP32'), lump('AFTER', 'c')] };
  const split = splitTeeth(writeWad(wad));
  assert.deepEqual(readWad(split.teeth).lumps, [lump('BEFORE', 'a'), ...map('MAP31'), lump('BETWEEN', 'b'), lump('AFTER', 'c')]);
  assert.deepEqual(readWad(split.badDream).lumps, [lump('BEFORE', 'a'), lump('BETWEEN', 'b'), ...map('MAP32'), lump('AFTER', 'c')]);
  assert.throws(() => splitTeeth(writeWad({ type: 'PWAD', lumps: map('MAP31') })), /MAP31 and MAP32/);
});
