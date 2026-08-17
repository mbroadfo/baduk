import type { Vertex } from './types.js';

export const SUPPORTED_SIZES = [9, 13, 19] as const;
export type BoardSize = (typeof SUPPORTED_SIZES)[number];

/** Go column labels skip "I" so it is never confused with "1" or "J". */
const COLUMN_LABELS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/**
 * Orthogonal neighbours for every vertex, precomputed once per board size.
 * Every hot loop in the engine and in the bots walks these arrays, so they are
 * built as flat typed arrays rather than arrays-of-arrays.
 */
export interface Geometry {
  readonly size: number;
  readonly area: number;
  /** Neighbour vertices, packed: neighbours of `v` are `nbr[off[v]..off[v+1]]`. */
  readonly nbr: Int16Array;
  readonly off: Int32Array;
}

const geometryCache = new Map<number, Geometry>();

export function geometry(size: number): Geometry {
  const cached = geometryCache.get(size);
  if (cached) return cached;
  if (!Number.isInteger(size) || size < 2 || size > 25) {
    throw new RangeError(`Unsupported board size: ${size}`);
  }

  const area = size * size;
  const off = new Int32Array(area + 1);
  const nbr = new Int16Array(area * 4);
  let cursor = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = y * size + x;
      off[v] = cursor;
      if (y > 0) nbr[cursor++] = v - size;
      if (y < size - 1) nbr[cursor++] = v + size;
      if (x > 0) nbr[cursor++] = v - 1;
      if (x < size - 1) nbr[cursor++] = v + 1;
    }
  }
  off[area] = cursor;

  const geo: Geometry = { size, area, nbr: nbr.subarray(0, cursor), off };
  geometryCache.set(size, geo);
  return geo;
}

export function vertexAt(size: number, x: number, y: number): Vertex {
  return y * size + x;
}

export function xOf(size: number, v: Vertex): number {
  return v % size;
}

export function yOf(size: number, v: Vertex): number {
  return Math.floor(v / size);
}

/** `D4`-style label. Rows are numbered from the bottom, as players read them. */
export function formatVertex(size: number, v: Vertex): string {
  const x = xOf(size, v);
  const y = yOf(size, v);
  return `${COLUMN_LABELS[x]}${size - y}`;
}

/** Parses `D4` / `d4`. Returns null rather than throwing, since it parses user input. */
export function parseVertex(size: number, label: string): Vertex | null {
  const match = /^([A-Za-z])\s*(\d{1,2})$/.exec(label.trim());
  if (!match) return null;
  const x = COLUMN_LABELS.indexOf(match[1].toUpperCase());
  const row = Number(match[2]);
  if (x < 0 || x >= size || row < 1 || row > size) return null;
  return vertexAt(size, x, size - row);
}

/**
 * Star points (hoshi). Purely cosmetic, but their absence makes a board look
 * wrong to anyone who has played before.
 */
export function starPoints(size: number): Vertex[] {
  if (size < 7) return [];
  const edge = size >= 13 ? 3 : 2;
  const mid = (size - 1) / 2;
  const lines = [edge, size - 1 - edge];
  if (size % 2 === 1 && size >= 9) lines.splice(1, 0, mid);

  const points: Vertex[] = [];
  for (const y of lines) {
    for (const x of lines) {
      // On even boards there is no true centre line to include.
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      points.push(vertexAt(size, x, y));
    }
  }
  // 13x13 conventionally shows only the four 4-4 points plus tengen.
  if (size === 13) {
    return [
      vertexAt(size, 3, 3),
      vertexAt(size, 9, 3),
      vertexAt(size, 6, 6),
      vertexAt(size, 3, 9),
      vertexAt(size, 9, 9),
    ];
  }
  return points;
}
