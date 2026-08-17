import { EMPTY, BLACK, WHITE, type Color, type Vertex, type Rules } from './types.js';
import type { Position } from './position.js';

/** Who an empty point counts for. */
export const NEUTRAL = 0 as const;
export type Owner = 0 | Color;

export interface ScoreBreakdown {
  readonly blackStones: number;
  readonly whiteStones: number;
  readonly blackTerritory: number;
  readonly whiteTerritory: number;
  /** Empty points bordered by both colours — they count for nobody. */
  readonly dame: number;
  readonly komi: number;
  readonly black: number;
  readonly white: number;
  /** Positive means Black leads by that many points. */
  readonly margin: number;
  readonly winner: Color | null;
}

/**
 * Maps every empty point to the colour that surrounds it, or NEUTRAL when it is
 * bordered by both (or by nothing, on an empty board).
 *
 * This is the honest, simple definition: it assumes every stone on the board is
 * alive. That is exactly right once both players pass in a finished game, and
 * it is what the territory overlay shows while teaching. It does *not* try to
 * judge life and death mid-game — that is the coach's job, and it says so.
 */
export function ownership(position: Position): Int8Array {
  const { area, nbr, off } = position.geo;
  const owner = new Int8Array(area);
  const visited = new Uint8Array(area);

  for (let start = 0; start < area; start++) {
    if (position.stones[start] !== EMPTY || visited[start]) continue;

    const region: Vertex[] = [start];
    visited[start] = 1;
    let touchesBlack = false;
    let touchesWhite = false;

    for (let i = 0; i < region.length; i++) {
      const cur = region[i];
      for (let k = off[cur]; k < off[cur + 1]; k++) {
        const n = nbr[k];
        const s = position.stones[n];
        if (s === EMPTY) {
          if (!visited[n]) {
            visited[n] = 1;
            region.push(n);
          }
        } else if (s === BLACK) {
          touchesBlack = true;
        } else {
          touchesWhite = true;
        }
      }
    }

    const value: Owner =
      touchesBlack && !touchesWhite ? BLACK : touchesWhite && !touchesBlack ? WHITE : NEUTRAL;
    for (const v of region) owner[v] = value;
  }
  return owner;
}

/**
 * Scores a position. `area` (Chinese) counts stones plus surrounded territory;
 * `territory` (Japanese) counts surrounded territory plus prisoners taken.
 *
 * Both assume all stones on the board are alive, so scores are only final after
 * both players have passed with dead stones removed.
 */
export function score(position: Position, rules: Rules): ScoreBreakdown {
  const owner = ownership(position);
  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let dame = 0;

  for (let v = 0; v < position.area; v++) {
    const s = position.stones[v];
    if (s === BLACK) blackStones++;
    else if (s === WHITE) whiteStones++;
    else if (owner[v] === BLACK) blackTerritory++;
    else if (owner[v] === WHITE) whiteTerritory++;
    else dame++;
  }

  const black =
    rules.scoring === 'area'
      ? blackStones + blackTerritory
      : blackTerritory + position.captures[BLACK - 1];
  const white =
    (rules.scoring === 'area'
      ? whiteStones + whiteTerritory
      : whiteTerritory + position.captures[WHITE - 1]) + rules.komi;

  const margin = black - white;
  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    dame,
    komi: rules.komi,
    black,
    white,
    margin,
    winner: margin > 0 ? BLACK : margin < 0 ? WHITE : null,
  };
}

/** `B+7.5` / `W+2.5` / `Draw` — the standard way results are written. */
export function formatResult(breakdown: ScoreBreakdown): string {
  if (breakdown.winner === null) return 'Draw';
  const margin = Math.abs(breakdown.margin);
  return `${breakdown.winner === BLACK ? 'B' : 'W'}+${margin % 1 === 0 ? margin : margin.toFixed(1)}`;
}
