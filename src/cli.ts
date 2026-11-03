#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { scan, select } from './scan.js';
import type { Edition } from './manifest.js';
import { build2012Archive, writeArchive } from './build-2012.js';
import { build2024Archive } from './build-2024.js';
import { build1995 } from './build-1995.js';
import { buildReport, type BuildReport } from './report.js';

const help = `Usage: master-levels <scan|build> [options]

  --config <file>     JSON configuration file
  --source <path>     WAD file or directory (repeatable)
  --edition <year>    Select 1995, 2012 or 2024
  --no-defaults       Only scan explicit sources
  --output <file>     Destination PK3 (build only)
  --pistol-start      Reset health and inventory between campaign maps
  --continuous        Carry health and inventory between campaign maps
  --force             Replace an existing output file
  --no-force          Do not replace output, overriding config force
  --copy              Copy 1995 WADs rather than creating links
  --json              Print machine-readable scan or build results
  --help              Show help

Build supports experimental 1995, 2012 and 2024 adapters.`;

async function main() {
  const command = process.argv[2];
  if (!command || command === '--help' || command === '-h') { console.log(help); return; }
  if (command !== 'scan' && command !== 'build') throw new Error(`Unknown command: ${command}`);
  const { values } = parseArgs({ args: process.argv.slice(3), options: {
    config: { type: 'string' }, source: { type: 'string', multiple: true },
    edition: { type: 'string' }, 'no-defaults': { type: 'boolean' },
    json: { type: 'boolean' }, help: { type: 'boolean' }, output: { type: 'string' },
    'pistol-start': { type: 'boolean' }, continuous: { type: 'boolean' }, force: { type: 'boolean' }, 'no-force': { type: 'boolean' }, copy: { type: 'boolean' }
  } });
  if (values.help) { console.log(help); return; }
  let config: { sources?: string[]; edition?: string; includeDefaults?: boolean; output?: string; pistolStart?: boolean; copy?: boolean; force?: boolean } = {};
  if (values.config) {
    const path = resolve(values.config);
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Config must be a JSON object');
    config = parsed as typeof config;
    if (config.sources !== undefined && (!Array.isArray(config.sources) || config.sources.some(s => typeof s !== 'string' || !s))) throw new Error('Config sources must be an array of paths');
    if (config.includeDefaults !== undefined && typeof config.includeDefaults !== 'boolean') throw new Error('Config includeDefaults must be a boolean');
    if (config.output !== undefined && (typeof config.output !== 'string' || !config.output)) throw new Error('Config output must be a path');
    if (config.pistolStart !== undefined && typeof config.pistolStart !== 'boolean') throw new Error('Config pistolStart must be a boolean');
    if (config.copy !== undefined && typeof config.copy !== 'boolean') throw new Error('Config copy must be a boolean');
    if (config.force !== undefined && typeof config.force !== 'boolean') throw new Error('Config force must be a boolean');
    config.sources = config.sources?.map(source => resolve(dirname(path), source));
    if (config.output) config.output = resolve(dirname(path), config.output);
  }
  const edition = values.edition ?? config.edition;
  if (edition !== undefined && !['1995', '2012', '2024'].includes(edition)) throw new Error('Edition must be 1995, 2012 or 2024');
  const paths = values.source?.map(path => resolve(path)) ?? config.sources ?? [];
  if (values['pistol-start'] && values.continuous) throw new Error('Choose either --pistol-start or --continuous');
  if (values.force && values['no-force']) throw new Error('Choose either --force or --no-force');
  const force = values.force ? true : values['no-force'] ? false : config.force ?? false;
  if (command === 'build' && edition === undefined) throw new Error('Build requires an edition');
  const output = values.output ? resolve(values.output) : config.output;
  if (command === 'build' && !output) throw new Error('Build requires --output or config output');
  const result = await scan(paths, values['no-defaults'] ? false : config.includeDefaults !== false);
  const selected = edition ? select(result, edition as Edition) : undefined;
  if (command === 'build') {
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    if (edition === '1995') {
      const sources = paths.length ? selected?.filter(match => match.explicit) : selected;
      if (!sources?.length) throw new Error('No supported 1995 WAD found in the specified sources');
      const dataPath = await build1995(sources, output!, values.copy ?? config.copy ?? (process.platform === 'win32'), force);
      printBuild(buildReport('1995', output!, sources, dataPath), values.json ?? false);
      return;
    }
    const source = selected?.[0];
    if (!source || (paths.length > 0 && !source.explicit)) throw new Error(`No supported ${edition} WAD found in the specified sources`);
    const pistolStart = values['pistol-start'] ? true : values.continuous ? false : config.pistolStart ?? false;
    const data = edition === '2024' ? build2024Archive(pistolStart) : build2012Archive(pistolStart);
    await writeArchive(output!, data, source.path, force);
    printBuild(buildReport(edition as Edition, output!, [source]), values.json ?? false);
    return;
  }
  if (values.json) console.log(JSON.stringify({ ...result, selected }, null, 2));
  else {
    for (const match of result.matches) console.log(`${match.file.edition} ${match.file.name}${match.file.revision ? ` (${match.file.revision})` : ''}: ${match.path}`);
    for (const path of result.unknown) console.log(`Unknown WAD: ${path}`);
    for (const error of result.errors) console.error(error);
    if (selected) {
      console.log(`Selected ${edition}: ${selected.length} file(s)`);
      for (const match of selected) console.log(`  ${match.file.name}: ${match.path}`);
    }
    if (!result.matches.length) console.log('No known Master Levels files found.');
  }
  if (result.errors.length || (selected && !selected.length)) process.exitCode = 1;
}

function printBuild(report: BuildReport, json: boolean): void {
  if (json) { console.log(JSON.stringify(report, null, 2)); return; }
  console.log(`Experimental ${report.edition} adapter: ${report.output}`);
  console.log('Load in order:');
  for (const path of report.loadFiles) console.log(`  ${path}`);
  if (report.missing.length) console.log(`Missing 1995 WADs (${report.missing.length}): ${report.missing.join(', ')}`);
  console.log(`UZDoom arguments (JSON array): ${JSON.stringify(report.launchArguments)}`);
  console.log('The adapter is experimental.');
}

main().catch((error: unknown) => { console.error((error as Error).message); process.exitCode = 1; });
