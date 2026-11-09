export interface Lump {
  name: string;
  data: Buffer;
}
export interface Wad {
  type: 'IWAD' | 'PWAD';
  lumps: Lump[];
}

/** Read the directory and validate every lump before using its data. */
export function readWad(input: Buffer): Wad {
  if (input.length < 12) throw new Error('WAD header is truncated');
  const type = input.toString('ascii', 0, 4);
  if (type !== 'IWAD' && type !== 'PWAD') throw new Error('Invalid WAD signature');
  const count = input.readUInt32LE(4);
  const offset = input.readUInt32LE(8);
  if (offset > input.length || count > Math.floor((input.length - offset) / 16))
    throw new Error('WAD directory is out of bounds');
  const lumps: Lump[] = [];
  for (let index = 0; index < count; index++) {
    const entry = offset + index * 16;
    const start = input.readUInt32LE(entry);
    const size = input.readUInt32LE(entry + 4);
    if (start > input.length || size > input.length - start)
      throw new Error(`WAD lump ${index} is out of bounds`);
    const nameBytes = input.subarray(entry + 8, entry + 16);
    const end = nameBytes.indexOf(0);
    const name = nameBytes.subarray(0, end < 0 ? 8 : end).toString('ascii');
    lumps.push({ name, data: input.subarray(start, start + size) });
  }
  return { type, lumps };
}

export function writeWad(wad: Wad): Buffer {
  const count = wad.lumps.length;
  const dataSize = wad.lumps.reduce((sum, lump) => sum + lump.data.length, 0);
  const directoryOffset = 12 + dataSize;
  if (directoryOffset + count * 16 > 0xffffffff) throw new Error('WAD is too large');
  const output = Buffer.alloc(directoryOffset + count * 16);
  output.write(wad.type, 0, 'ascii');
  output.writeUInt32LE(count, 4);
  output.writeUInt32LE(directoryOffset, 8);
  let offset = 12;
  for (let index = 0; index < count; index++) {
    const lump = wad.lumps[index];
    if (!/^[\x21-\x7e]{1,8}$/.test(lump.name))
      throw new Error(`Invalid WAD lump name: ${lump.name}`);
    lump.data.copy(output, offset);
    const entry = directoryOffset + index * 16;
    output.writeUInt32LE(offset, entry);
    output.writeUInt32LE(lump.data.length, entry + 4);
    output.write(lump.name, entry + 8, 'ascii');
    offset += lump.data.length;
  }
  return output;
}

const doomMapLumps = [
  'THINGS',
  'LINEDEFS',
  'SIDEDEFS',
  'VERTEXES',
  'SEGS',
  'SSECTORS',
  'NODES',
  'SECTORS',
  'REJECT',
  'BLOCKMAP',
];

/** Split the two known vanilla maps while preserving non-map resources and their order. */
export function splitTeeth(input: Buffer): { teeth: Buffer; badDream: Buffer } {
  const wad = readWad(input);
  if (wad.type !== 'PWAD') throw new Error('Expected a PWAD');
  const ranges = new Map<string, [number, number]>();
  for (let i = 0; i < wad.lumps.length; i++) {
    const name = wad.lumps[i].name.toUpperCase();
    if (name !== 'MAP31' && name !== 'MAP32') continue;
    if (ranges.has(name)) throw new Error(`Duplicate ${name}`);
    for (let j = 0; j < doomMapLumps.length; j++) {
      if (wad.lumps[i + j + 1]?.name.toUpperCase() !== doomMapLumps[j])
        throw new Error(`Invalid ${name} map data`);
    }
    ranges.set(name, [i, i + doomMapLumps.length + 1]);
  }
  if (ranges.size !== 2) throw new Error('TEETH.WAD must contain MAP31 and MAP32');
  const build = (keep: string) => {
    const remove = ranges.get(keep === 'MAP31' ? 'MAP32' : 'MAP31')!;
    return writeWad({
      type: 'PWAD',
      lumps: wad.lumps.filter((_, index) => index < remove[0] || index >= remove[1]),
    });
  };
  return { teeth: build('MAP31'), badDream: build('MAP32') };
}
