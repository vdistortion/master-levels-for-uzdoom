import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve, win32 } from 'node:path';
import { knownFiles, type Edition, type KnownFile } from './manifest.js';

export interface Match { file: KnownFile; path: string; explicit: boolean }
export interface ScanResult { matches: Match[]; unknown: string[]; errors: string[] }

async function digest(path: string, algorithm: 'sha1' | 'sha256'): Promise<string> {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function identify(path: string): Promise<KnownFile | undefined> {
  const info = await stat(path);
  if (!info.isFile()) return undefined;
  const candidates = knownFiles.filter(file => file.size === info.size);
  if (!candidates.length) return undefined;
  const sha256 = candidates.some(file => file.sha256) ? await digest(path, 'sha256') : undefined;
  const sha1 = candidates.some(file => file.sha1) ? await digest(path, 'sha1') : undefined;
  return candidates.find(file => file.sha256 ? file.sha256 === sha256 : file.sha1 === sha1);
}

/** Read modern and legacy libraryfolders.vdf paths, not arbitrary numeric app IDs. */
export function parseSteamLibraries(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*"(path|\d+)"\s+"((?:\\.|[^"\\])*)"\s*(?:\/\/.*)?$/i.exec(line);
    if (!match) continue;
    const path = match[2].replace(/\\([\\"])/g, '$1');
    if (isAbsolute(path) || win32.isAbsolute(path)) paths.push(path);
  }
  return [...new Set(paths)];
}

export async function steamPaths(steamRoot: string): Promise<string[]> {
  let libraries = [steamRoot];
  try {
    const text = await readFile(join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    libraries = [...new Set([...libraries, ...parseSteamLibraries(text)])];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return libraries.flatMap(library => {
    const game = join(library, 'steamapps', 'common', 'Ultimate Doom');
    return [join(game, 'base', 'master', 'wads'), join(game, 'rerelease', 'masterlevels.wad')];
  });
}

/** Only use explicitly listed resource search directories; leave unknown variables unresolved. */
export function parseUzdoomSearchPaths(text: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const paths: string[] = [];
  let inSearchSection = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      inSearchSection = /^(?:IWADSearch|FileSearch)\.Directories$/i.test(section[1]);
      continue;
    }
    if (!inSearchSection) continue;
    const match = /^Path\s*=\s*(.*?)\s*$/i.exec(line);
    if (!match || !match[1]) continue;
    let unresolved = false;
    const value = match[1].replace(/^"(.*)"$/, '$1').replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_all, key: string) => {
      const replacement = env[key];
      if (!replacement) { unresolved = true; return ''; }
      return replacement;
    });
    if (!unresolved && value) paths.push(resolve(value));
  }
  return [...new Set(paths)];
}

export async function uzdoomConfigPaths(configPath: string): Promise<string[]> {
  try {
    return parseUzdoomSearchPaths(await readFile(configPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function defaultPaths(): Promise<string[]> {
  const home = homedir();
  if (process.platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const configDir = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return [join(home, 'Documents', 'My Games', 'UZDoom'), ...await uzdoomConfigPaths(join(configDir, 'uzdoom', 'uzdoom.ini')), ...await steamPaths(join(programFiles, 'Steam'))];
  }
  const configDir = process.env.XDG_CONFIG_HOME || join(home, '.config');
  return [join(home, '.local', 'share', 'games', 'uzdoom'), ...await uzdoomConfigPaths(join(configDir, 'uzdoom', 'uzdoom.ini')), ...await steamPaths(join(home, '.steam', 'steam'))];
}

export async function scan(paths: string[], includeDefaults = true): Promise<ScanResult> {
  const result: ScanResult = { matches: [], unknown: [], errors: [] };
  const seen = new Set<string>();
  async function inspect(filePath: string, explicit: boolean) {
    const path = resolve(filePath);
    try {
      const canonical = await realpath(path);
      if (seen.has(canonical)) return;
      seen.add(canonical);
      const file = await identify(path);
      if (file) result.matches.push({ file, path, explicit });
      else result.unknown.push(path);
    } catch (error) {
      result.errors.push(`${path}: ${(error as Error).message}`);
    }
  }
  async function visit(input: string, explicit: boolean) {
    try {
      const info = await stat(input);
      if (info.isDirectory()) {
        const entries = (await readdir(input)).filter(name => extname(name).toLowerCase() === '.wad').sort();
        for (const name of entries) await inspect(join(input, name), explicit);
      } else await inspect(input, explicit);
    } catch (error) {
      if (explicit) result.errors.push(`${resolve(input)}: ${(error as Error).message}`);
    }
  }
  for (const path of paths) await visit(path, true);
  if (includeDefaults) for (const path of await defaultPaths()) await visit(path, false);
  return result;
}

export function select(result: ScanResult, edition: Edition): Match[] {
  const matches = result.matches.filter(match => match.file.edition === edition);
  if (edition === '1995') {
    const chosen = new Map<string, Match>();
    for (const match of matches) if (!chosen.has(match.file.name)) chosen.set(match.file.name, match);
    return [...chosen.values()].sort((a, b) => a.file.name.localeCompare(b.file.name));
  }
  return matches.sort((a, b) => Number(b.explicit) - Number(a.explicit) || (b.file.revision || '').localeCompare(a.file.revision || '')) .slice(0, 1);
}
