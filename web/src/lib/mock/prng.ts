export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(seed: string): () => number {
  return mulberry32(strHash(seed));
}

export function pickFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pickInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function addrFromSeed(seed: string): `0x${string}` {
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    parts.push(strHash(`${seed}:addr:${i}`).toString(16).padStart(8, "0"));
  }
  return `0x${parts.join("").slice(0, 40)}` as `0x${string}`;
}
