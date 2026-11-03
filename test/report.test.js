import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../dist/report.js';
import { knownFiles } from '../dist/manifest.js';

test('1995 report describes missing WADs and correct load order', () => {
  const file = knownFiles.find(item => item.name === 'ATTACK.WAD');
  const report = buildReport('1995', '/output/adapter.pk3', [{ file, path: '/source/attack.wad', explicit: true }], '/output/adapter-data');
  assert.equal(report.experimental, true);
  assert.equal(report.missing.length, 19);
  assert.ok(!report.missing.includes('ATTACK.WAD'));
  assert.deepEqual(report.loadFiles, ['/output/adapter-data', '/output/adapter.pk3']);
  assert.deepEqual(report.launchArguments, ['-iwad', 'DOOM2.WAD', '-file', ...report.loadFiles]);
});

test('2024 report loads the original WAD before the adapter', () => {
  const file = knownFiles.find(item => item.edition === '2024');
  const report = buildReport('2024', '/output/adapter.pk3', [{ file, path: '/source/masterlevels.wad', explicit: true }]);
  assert.deepEqual(report.loadFiles, ['/source/masterlevels.wad', '/output/adapter.pk3']);
  assert.deepEqual(report.missing, []);
});
