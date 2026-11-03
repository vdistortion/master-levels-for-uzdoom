import { writeWad } from './wad.js';
import { readFileSync } from 'node:fs';

const titleMap = `namespace = "zdoom";
vertex { x = -160; y = -1024; }
vertex { x = -160; y = 1024; }
vertex { x = 184; y = 1024; }
vertex { x = 184; y = -1024; }
vertex { x = 192; y = 1024; }
vertex { x = 192; y = -1024; }
vertex { x = -32; y = -64; }
vertex { x = -32; y = 64; }
vertex { x = 96; y = 64; }
vertex { x = 96; y = -64; }
sector { heightfloor = -200; heightceiling = 408; texturefloor = "FLOOR4_8"; textureceiling = "FLOOR4_8"; lightlevel = 0; }
sector { heightfloor = -200; heightceiling = 408; texturefloor = "FLOOR4_8"; textureceiling = "FLOOR4_8"; lightlevel = 0; }
sector { heightfloor = 0; heightceiling = 408; texturefloor = "FLOOR4_8"; textureceiling = "FLOOR4_8"; lightlevel = 0; }
sidedef { sector = 0; texturemiddle = "MLBACK"; }
sidedef { sector = 0; texturemiddle = "MLBACK"; }
sidedef { sector = 1; texturemiddle = "MLBACK"; }
sidedef { sector = 1; texturemiddle = "MLBACK"; offsetx = 51; }
sidedef { sector = 1; texturemiddle = "MLBACK"; }
sidedef { sector = 0; texturemiddle = "MLBACK"; }
sidedef { sector = 0; texturemiddle = "FIRWARP"; wrapmidtex = true; }
sidedef { sector = 1; }
sidedef { sector = 2; texturebottom = "FLOOR4_8"; }
sidedef { sector = 0; }
sidedef { sector = 2; texturebottom = "FLOOR4_8"; }
sidedef { sector = 0; }
sidedef { sector = 2; texturebottom = "FLOOR4_8"; }
sidedef { sector = 0; }
sidedef { sector = 2; texturebottom = "FLOOR4_8"; }
sidedef { sector = 0; }
linedef { v1 = 0; v2 = 1; sidefront = 0; blocking = true; }
linedef { v1 = 1; v2 = 2; sidefront = 1; blocking = true; }
linedef { v1 = 2; v2 = 4; sidefront = 2; blocking = true; }
linedef { v1 = 4; v2 = 5; sidefront = 3; blocking = true; }
linedef { v1 = 5; v2 = 3; sidefront = 4; blocking = true; }
linedef { v1 = 3; v2 = 0; sidefront = 5; blocking = true; }
linedef { v1 = 2; v2 = 3; sidefront = 6; sideback = 7; twosided = true; alpha = 0.0; renderstyle = "add"; }
linedef { v1 = 6; v2 = 7; sidefront = 8; sideback = 9; twosided = true; }
linedef { v1 = 7; v2 = 8; sidefront = 10; sideback = 11; twosided = true; }
linedef { v1 = 8; v2 = 9; sidefront = 12; sideback = 13; twosided = true; }
linedef { v1 = 9; v2 = 6; sidefront = 14; sideback = 15; twosided = true; }
thing { x = 64; y = 0; angle = 0; type = 1; skill1 = true; skill2 = true; skill3 = true; skill4 = true; skill5 = true; single = true; }
`;

export const titleMapInfo = 'map TITLEMAP "Title" { music = "D_DM2TTL" }';

export const titleScript = `
class MLTitleAnimation : EventHandler
{
  override void WorldTick()
  {
    if (!(level.MapName ~== "TITLEMAP") || level.Sides.Size() < 8 || level.Lines.Size() < 7 || level.Sectors.Size() < 3) return;
    // Approximate the legacy black screen fades with TITLEMAP-local sector light.
    int tick = level.maptime;
    double light = tick < 35 ? 0.05 * tick / 35.0
      : tick < 238 ? 0.05
      : tick < 273 ? 0.05 + 0.40 * (tick - 238) / 35.0
      : tick < 543 ? 0.45
      : tick < 578 ? 0.45 + 0.55 * (tick - 543) / 35.0 : 1.0;
    for (int sector = 0; sector < 3; sector++) level.Sectors[sector].lightlevel = int(light * 255);
    for (int i = 0; i < 6; i++) level.Sides[i].AddTextureYOffset(Side.mid, 52.0 / 64);
    int t = level.maptime % 140;
    double brightness = t < 1 ? 20.0 / 255 : t < 2 ? 40.0 / 255 : t < 3 ? 65.0 / 255
      : t < 5 ? 95.0 / 255 : t < 8 ? 128.0 / 255 : t < 10 ? 95.0 / 255
      : t < 11 ? 75.0 / 255 : t < 12 ? 40.0 / 255 : t < 13 ? 20.0 / 255 : 0;
    color glowColor = color(192, 96, 0);
    level.Sides[6].SetSpecialColor(Side.mid, Side.walltop, glowColor);
    level.Sides[6].SetSpecialColor(Side.mid, Side.wallbottom, glowColor);
    level.Lines[6].alpha = brightness;
  }
}
`;

// The supplied 1024x512 image is scaled to 256x128 map units, like the old title background.
// W65B_1 is looked up from the user's Doom II IWAD, never copied into the package.
export const fireWarpTextures = `Graphic M_DOOM, 425, 139
{
  XScale 3.3
  YScale 3.3
  Offset -10, -61
  Patch M_TITLE, 0, 0 { Blend "#ff8000", 0.5 }
}

Texture MLBACK, 1024, 512
{
  XScale 4.0
  YScale 4.0
  Patch MLBGIMG, 0, 0
}

Texture FIRWARP, 256, 256
{
  XScale 2.0
  YScale 2.0
  Patch W65B_1, 0, 0 { Translation "Desaturate", 31 }
  Patch W65B_1, 128, 0 { Translation "Desaturate", 31 }
  Patch W65B_1, 0, 128 { Translation "Desaturate", 31 }
  Patch W65B_1, 128, 128 { Translation "Desaturate", 31 }
}
`;

export function titleResources(): Record<string, Uint8Array> {
  const map = writeWad({ type: 'PWAD', lumps: [
    { name: 'TITLEMAP', data: Buffer.alloc(0) },
    { name: 'TEXTMAP', data: Buffer.from(titleMap) },
    { name: 'ENDMAP', data: Buffer.alloc(0) }
  ] });
  return { 'maps/TITLEMAP.wad': map, 'patches/MLBGIMG.webp': readFileSync(new URL('../assets/biomechanical-tile.webp', import.meta.url)), 'graphics/M_TITLE.webp': readFileSync(new URL('../assets/ml-title.webp', import.meta.url)), TEXTURES: Buffer.from(fireWarpTextures), ANIMDEFS: Buffer.from('WARP TEXTURE FIRWARP\n') };
}
