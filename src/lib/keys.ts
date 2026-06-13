// src/lib/keys.ts

export const keyColors: Record<string, string> = {
  '12B':'#18d5ff', '1B':'#37f1af', '2B':'#a4f369', '3B':'#ffd65b',
  '4B':'#ff934e', '5B':'#ff607b', '6B':'#e55af1', '7B':'#aa62ff',
  '8B':'#69a3ff', '9B':'#42d3ff', '10B':'#18d5ff', '11B':'#23f2bd',
  '12A':'#00bfff', '1A':'#18ffb0', '2A':'#27e38c', '3A':'#ffd600',
  '4A':'#ffaa00', '5A':'#ff4b5c', '6A':'#ff5074', '7A':'#ec5bff',
  '8A':'#ec5bff', '9A':'#16b7ff', '10A':'#00d8ff', '11A':'#2fb8ff'
};

export const keyNotationMapping: Record<string, Record<string, string>> = {
  camelot: {
    '12B':'12B', '1B':'1B', '2B':'2B', '3B':'3B', '4B':'4B', '5B':'5B', '6B':'6B', '7B':'7B', '8B':'8B', '9B':'9B', '10B':'10B', '11B':'11B',
    '12A':'12A', '1A':'1A', '2A':'2A', '3A':'3A', '4A':'4A', '5A':'5A', '6A':'6A', '7A':'7A', '8A':'8A', '9A':'9A', '10A':'10A', '11A':'11A'
  },
  musical: {
    '12B':'E', '1B':'B', '2B':'F#', '3B':'Db', '4B':'Ab', '5B':'Eb', '6B':'Bb', '7B':'F', '8B':'C', '9B':'G', '10B':'D', '11B':'A',
    '12A':'Dbm', '1A':'Abm', '2A':'Ebm', '3A':'Bbm', '4A':'Fm', '5A':'Cm', '6A':'Gm', '7A':'Dm', '8A':'Am', '9A':'Em', '10A':'Bm', '11A':'F#m'
  },
  openkey: {
    '12B':'1d', '1B':'2d', '2B':'3d', '3B':'4d', '4B':'5d', '5B':'6d', '6B':'7d', '7B':'8d', '8B':'9d', '9B':'10d', '10B':'11d', '11B':'12d',
    '12A':'1m', '1A':'2m', '2A':'3m', '3A':'4m', '4A':'5m', '5A':'6m', '6A':'7m', '7A':'8m', '8A':'9m', '9A':'10m', '10A':'11m', '11A':'12m'
  }
};

/**
 * Returns an array of keys that are compatible with the given Camelot key
 * according to the Camelot wheel rules:
 * - The key itself
 * - Opposite mode (A <-> B)
 * - Clockwise adjacent (+1)
 * - Counter-clockwise adjacent (-1)
 */
export function getCompatibleCamelotKeys(key: string): string[] {
  if (!key || key === '--') return [];
  const match = key.match(/^(\d+)([AB])$/);
  if (!match) return [key];
  
  const num = parseInt(match[1], 10);
  const letter = match[2];
  
  const otherLetter = letter === 'A' ? 'B' : 'A';
  
  // Adjacent numbers with wrapping (1 to 12)
  const prevNum = num === 1 ? 12 : num - 1;
  const nextNum = num === 12 ? 1 : num + 1;
  
  return [
    key,
    `${num}${otherLetter}`,
    `${prevNum}${letter}`,
    `${nextNum}${letter}`
  ];
}
