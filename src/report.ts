import { knownFiles, type Edition } from './manifest.js';
import type { Match } from './scan.js';

export interface BuildReport {
  experimental: true;
  edition: Edition;
  output: string;
  sources: string[];
  loadFiles: string[];
  missing: string[];
  launchArguments: string[];
}

/** File paths are arguments, not a shell command; consumers can spawn UZDoom safely. */
export function buildReport(
  edition: Edition,
  output: string,
  sources: Match[],
  dataPath?: string,
): BuildReport {
  const loadFiles = edition === '1995' ? [dataPath!, output] : [sources[0].path, output];
  const included = new Set(sources.map((source) => source.file.name));
  const missing =
    edition === '1995'
      ? knownFiles
          .filter((file) => file.edition === '1995' && !included.has(file.name))
          .map((file) => file.name)
      : [];
  return {
    experimental: true,
    edition,
    output,
    sources: sources.map((source) => source.path),
    loadFiles,
    missing,
    launchArguments: ['-iwad', 'DOOM2.WAD', '-file', ...loadFiles],
  };
}
