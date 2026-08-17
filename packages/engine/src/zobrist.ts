/**
 * Zobrist hashing: an incremental whole-board fingerprint used for superko
 * detection and as a transposition key for bots.
 *
 * Hashes are 53-bit-safe pairs of 32-bit words packed into a single string key
 * only at lookup time; internally we keep two numbers so XOR updates stay in
 * integer arithmetic and never allocate BigInts on the hot path.
 */

import type { Color, Vertex } from './types.js';

export interface Hash {
  readonly hi: number;
  readonly lo: number;
}

export const ZERO_HASH: Hash = { hi: 0, lo: 0 };

/** Deterministic PRNG so replays and tests are reproducible across runs. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export interface ZobristTable {
  readonly size: number;
  /** Per (colour, vertex) key words. Colour 1 and 2 occupy the two halves. */
  readonly hi: Int32Array;
  readonly lo: Int32Array;
  readonly turnHi: number;
  readonly turnLo: number;
}

const tables = new Map<number, ZobristTable>();

export function zobristTable(size: number): ZobristTable {
  const cached = tables.get(size);
  if (cached) return cached;

  const area = size * size;
  const rand = splitmix32(0x5eed + size);
  const hi = new Int32Array(area * 2);
  const lo = new Int32Array(area * 2);
  for (let i = 0; i < area * 2; i++) {
    hi[i] = rand() | 0;
    lo[i] = rand() | 0;
  }
  const table: ZobristTable = {
    size,
    hi,
    lo,
    turnHi: rand() | 0,
    turnLo: rand() | 0,
  };
  tables.set(size, table);
  return table;
}

/** XOR a stone in or out. Zobrist is its own inverse, so one function does both. */
export function toggleStone(hash: Hash, table: ZobristTable, color: Color, v: Vertex): Hash {
  const i = (color - 1) * table.size * table.size + v;
  return { hi: (hash.hi ^ table.hi[i]) | 0, lo: (hash.lo ^ table.lo[i]) | 0 };
}

export function toggleTurn(hash: Hash, table: ZobristTable): Hash {
  return { hi: (hash.hi ^ table.turnHi) | 0, lo: (hash.lo ^ table.turnLo) | 0 };
}

export function hashKey(hash: Hash): string {
  return `${hash.hi},${hash.lo}`;
}

export function hashEquals(a: Hash, b: Hash): boolean {
  return a.hi === b.hi && a.lo === b.lo;
}
