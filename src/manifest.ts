export type Edition = '1995' | '2012' | '2024';
export interface KnownFile {
  name: string;
  edition: Edition;
  size: number;
  sha256?: string;
  sha1?: string;
  revision?: string;
}

// SHA-256 values identify the locally checked 1995 files, not published CD hashes.
const originals: [string, number, string][] = [
  ['ATTACK', 185135, '4b9a404a4ee43ed33f7c2e208269b84b58ccfec5823afa1fe50e3dd08e927622'],
  ['BLACKTWR', 199534, 'a0120667412fcf293ea13cdc31c1fa0626d7828f83a195aa09f4170797d07473'],
  ['BLOODSEA', 258942, '1b1acb09f4319db32903dc502d84fc034d21611e375771f4aaac66fafabea39a'],
  ['CANYON', 157529, 'a2dd18d174d25a5d31046114bf73d87e9e13e49e9e6b509b2c9942e77d4c9ecf'],
  ['CATWALK', 151817, 'ce1241e16b2e8bb8bbceea84a281e81f865c52670e4eb3649dc7372870985b77'],
  ['COMBINE', 141548, 'fef0ac1090ba2f0bce92503625047d726c2d8d1964561bd557234e7ab6202dff'],
  ['FISTULA', 104654, '864d51febc039b1431c5d75fb051f567433adbddce4bb4d8b6e959fc0b414724'],
  ['GARRISON', 116403, '7a7a37d1f31c51ced17167f5283daffef27d79310df0c96b13f4cb1723a2417c'],
  ['GERYON', 221009, 'ec5c0b1b846764d4b7cc8038e5fac1b1562627d0bcca413a55e918d3141cbfbc'],
  ['MANOR', 245444, 'fe0a502310ef1b32597e2e82d6f7f12ad77cb603ac5838056dee86f4bae31e2f'],
  ['MEPHISTO', 121406, '585040c5408bc66583dbe1b8e36d009c81799f7dbebd002af48e4c00088bfbd5'],
  ['MINOS', 351712, 'fc3996e52b527dd4d7e76b023eebaa0c18263c94e21115b06ba64c8cda371ec0'],
  ['NESSUS', 158514, '05a2e5f7e13acfe21895f6ad2ecd216052d8c5c4bcb65b67745678ca0ae3e0dc'],
  ['PARADOX', 223555, '4e9f37b8209dc7006637050876d917e9a68b053ef24e17725432781b00969bdf'],
  ['SUBSPACE', 105780, '2c61963efe338abc38b13fb01f238fd95d6b0e2a627ca78db038b9761ff6e6ac'],
  ['SUBTERRA', 127480, '3dba2abcb85ae3685c259b21bd867d542439c591c12162a36066f1fbab6cbdd8'],
  ['TEETH', 190531, '629e2a6eb1a0234ef0f152384a01130b3d8cd0e44f6c292463dbc2d6ae34d14e'],
  ['TTRAP', 286220, '90c7d8fc103e7b02b9602d5eb37fa439da1c5880355e4ee9fa53428ef30dcf45'],
  ['VESPERAS', 235353, '14a515f480455a4bd23c8204d9d236c9ba18c147e8c10a364300832ee804fea3'],
  ['VIRGIL', 171232, 'c468a1684be8e8055fca52c0c0b3068893481dbaeff0d25f2d72a13b340dff09']
];

export const knownFiles: KnownFile[] = [
  ...originals.map(([name, size, sha256]) => ({ name: `${name}.WAD`, edition: '1995' as const, size, sha256 })),
  { name: 'MASTERLEVELS.WAD', edition: '2012', size: 3479715, sha256: '458bbd4e43425b1fdb882a51b23224abaf5e6713a7bfcdc19830bd4196f402f5' },
  // Only the published SHA-1 is available for the August revision.
  { name: 'masterlevels.wad', edition: '2024', size: 3894977, sha1: '47d5b10aee861791c9272ba4944e8eb1ea1e0819', revision: '2024-08-08' },
  { name: 'masterlevels.wad', edition: '2024', size: 3920169, sha256: '3e42d71e316a3e3e53d47860509998d63a0758eafd846171c77f218b0043eaef', revision: '2024-10-03' }
];
