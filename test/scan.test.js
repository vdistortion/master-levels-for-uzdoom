import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { knownFiles } from '../dist/manifest.js';
import {
  parseSteamLibraries,
  parseUzdoomSearchPaths,
  scan,
  select,
  steamPaths,
} from '../dist/scan.js';

test('manifest contains all supported known files', () => {
  assert.equal(knownFiles.filter((f) => f.edition === '1995').length, 20);
  assert.equal(knownFiles.filter((f) => f.edition === '2012').length, 1);
  assert.equal(knownFiles.filter((f) => f.edition === '2024').length, 2);
  assert.equal(new Set(knownFiles.map((f) => f.sha256 || f.sha1)).size, 23);
});

test('unknown files and missing explicit paths are reported', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-levels-'));
  try {
    await writeFile(join(dir, 'unknown.wad'), 'not a wad');
    const result = await scan([dir, join(dir, 'missing')], false);
    assert.deepEqual(result.unknown, [join(dir, 'unknown.wad')]);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(select(result, '1995'), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'same file reached through a symlink is inspected only once',
  { skip: process.platform === 'win32' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'master-levels-'));
    try {
      const original = join(dir, 'original.wad');
      const alias = join(dir, 'alias.wad');
      await writeFile(original, 'unknown');
      await symlink(original, alias);
      const result = await scan([alias, original], false);
      assert.deepEqual(result.unknown, [alias]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('selection prefers explicit sources and newer automatic revision', () => {
  const [old, latest] = knownFiles.filter((f) => f.edition === '2024');
  const matches = [
    { file: old, path: 'old', explicit: false },
    { file: latest, path: 'new', explicit: false },
  ];
  assert.equal(select({ matches, errors: [], unknown: [] }, '2024')[0].path, 'new');
  matches[0].explicit = true;
  assert.equal(select({ matches, errors: [], unknown: [] }, '2024')[0].path, 'old');
});

test('Steam library paths include modern and legacy entries, but not app IDs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-levels-steam-'));
  try {
    const extra = join(dir, 'extra library');
    const escapeVdf = (path) => path.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    const vdf = `"libraryfolders"\n{\n  "0"\n  {\n    "path" "${escapeVdf(dir)}"\n    "apps"\n    {\n      "2280" "12345"\n    }\n  }\n  "1" "${escapeVdf(extra)}"\n}\n`;
    assert.deepEqual(parseSteamLibraries(vdf), [dir, extra]);
    assert.deepEqual(parseSteamLibraries('"path" "C:\\\\Games\\\\Steam"'), ['C:\\Games\\Steam']);
    await mkdir(join(dir, 'steamapps'));
    await writeFile(join(dir, 'steamapps', 'libraryfolders.vdf'), vdf);
    const paths = await steamPaths(dir);
    assert.equal(paths.length, 4);
    assert.equal(
      paths[2],
      join(extra, 'steamapps', 'common', 'Ultimate Doom', 'base', 'master', 'wads'),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('UZDoom search paths only use resource sections and known environment variables', () => {
  const config = `[IWADSearch.Directories]\nPath=$HOME/wads\nPath=$UNKNOWN/skip\n[FileSearch.Directories]\nPath=$DOOMWADDIR\nPath=$HOME/wads\n[SoundfontSearch.Directories]\nPath=/ignored\n`;
  assert.deepEqual(parseUzdoomSearchPaths(config, { HOME: '/home/test', DOOMWADDIR: '/games' }), [
    resolve('/home/test/wads'),
    resolve('/games'),
  ]);
});

test('config paths are relative to config, CLI paths override config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-levels-'));
  try {
    await writeFile(join(dir, 'unknown.wad'), 'unknown');
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ sources: ['unknown.wad'], includeDefaults: false }),
    );
    const run = (...args) =>
      JSON.parse(
        execFileSync(process.execPath, ['dist/cli.js', 'scan', '--json', ...args], {
          encoding: 'utf8',
        }),
      );
    assert.deepEqual(run('--config', join(dir, 'config.json')).unknown, [join(dir, 'unknown.wad')]);
    assert.deepEqual(run('--config', join(dir, 'config.json'), '--source', dir).unknown, [
      join(dir, 'unknown.wad'),
    ]);
    assert.equal(
      spawnSync(process.execPath, ['dist/cli.js', 'scan', '--no-defaults', '--edition', '1995'])
        .status,
      1,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('force option is validated and conflicting flags are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'master-levels-config-'));
  try {
    const config = join(dir, 'config.json');
    await writeFile(config, JSON.stringify({ force: 'yes', includeDefaults: false }));
    const invalid = spawnSync(process.execPath, ['dist/cli.js', 'scan', '--config', config], {
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Config force must be a boolean/);
    const conflict = spawnSync(process.execPath, ['dist/cli.js', 'scan', '--force', '--no-force'], {
      encoding: 'utf8',
    });
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /Choose either --force or --no-force/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
