import type { Position, Group } from './position.js';
import { BLACK, EMPTY, WHITE, opponent, type Color, type Vertex } from './types.js';

/**
 * Rules-derived tactical facts. Deliberately *not* opinions — everything here
 * is checkable from the position alone. The bots use these to choose moves and
 * the coach uses the same facts to explain them, so a bot's reasoning and the
 * advice a learner reads can never drift apart.
 */

export interface CaptureMove {
  readonly vertex: Vertex;
  /** Opponent stones removed if this move is played. */
  readonly stones: number;
}

/** Distinct groups of `color` with exactly one liberty left. */
export function groupsInAtari(position: Position, color: Color): Group[] {
  const found: Group[] = [];
  const seen = new Uint8Array(position.area);
  for (let v = 0; v < position.area; v++) {
    if (position.stones[v] !== color || seen[v]) continue;
    const group = position.group(v);
    if (!group) continue;
    for (const s of group.stones) seen[s] = 1;
    if (group.liberties.length === 1) found.push(group);
  }
  return found;
}

/** Every legal move for `color` that captures at least one enemy stone. */
export function capturingMoves(position: Position, color: Color): CaptureMove[] {
  const foe = opponent(color);
  const byVertex = new Map<Vertex, number>();
  for (const group of groupsInAtari(position, foe)) {
    const point = group.liberties[0];
    if (!position.isLegal({ type: 'play', vertex: point }, color)) continue;
    byVertex.set(point, (byVertex.get(point) ?? 0) + group.stones.length);
  }
  return [...byVertex].map(([vertex, stones]) => ({ vertex, stones })).sort((a, b) => b.stones - a.stones);
}

/** Liberties the group at `vertex` would have if `color` played there. */
export function libertiesAfter(position: Position, vertex: Vertex, color: Color): number {
  const result = position.tryPlay({ type: 'play', vertex }, color);
  if (!result) return 0;
  return result.position.libertyCount(vertex);
}

/**
 * True if playing here leaves the resulting group on a single liberty without
 * capturing anything — the single most common beginner blunder.
 */
export function isSelfAtari(position: Position, vertex: Vertex, color: Color): boolean {
  const result = position.tryPlay({ type: 'play', vertex }, color);
  if (!result) return false;
  if (result.captured.length > 0) return false;
  return result.position.libertyCount(vertex) === 1;
}

/** Moves that raise a one-liberty group's liberty count, plus counter-captures. */
export function savingMoves(position: Position, group: Group): CaptureMove[] {
  const color = group.color;
  const options: CaptureMove[] = [];

  // Run: fill the last liberty and hope the new shape breathes.
  const escape = group.liberties[0];
  if (escape !== undefined && position.isLegal({ type: 'play', vertex: escape }, color)) {
    if (libertiesAfter(position, escape, color) >= 2) options.push({ vertex: escape, stones: 0 });
  }

  // Fight back: capturing an adjacent attacker also frees the group.
  for (const move of capturingMoves(position, color)) {
    if (!options.some((o) => o.vertex === move.vertex)) options.push(move);
  }
  return options;
}

/**
 * Reads a ladder: can the group in atari escape by running, assuming the
 * attacker keeps it in atari every move?
 *
 * Returns true when the group breaks free. Bounded by `maxDepth` so a bad
 * position cannot stall the UI; an unresolved read counts as an escape, since
 * claiming a capture we cannot prove would teach the wrong lesson.
 */
export function ladderEscapes(position: Position, group: Group, maxDepth = 64): boolean {
  if (group.liberties.length > 1) return true;
  return runLadder(position, group.stones[0], group.color, maxDepth);
}

function runLadder(position: Position, stone: Vertex, color: Color, depth: number): boolean {
  if (depth <= 0) return true;

  const group = position.group(stone);
  if (!group || group.color !== color) return true; // already captured or changed hands
  if (group.liberties.length >= 3) return true; // out of the ladder
  if (group.liberties.length === 0) return false;

  const escape = group.liberties[0];
  const run = position.tryPlay({ type: 'play', vertex: escape }, color);
  if (!run) return false;

  const escaped = run.position.group(escape);
  if (!escaped) return true;
  if (escaped.liberties.length >= 3) return true;
  if (escaped.liberties.length === 0) return false;

  // The attacker plays the liberty that keeps the runner on one breath.
  const foe = opponent(color);
  for (const chase of escaped.liberties) {
    const chased = run.position.tryPlay({ type: 'play', vertex: chase }, foe);
    if (!chased) continue;
    const after = chased.position.group(escape);
    if (!after) return false; // runner was captured
    if (after.liberties.length <= 1 && !runLadder(chased.position, escape, color, depth - 1)) {
      return false;
    }
  }
  return true;
}

/**
 * A cheap influence map: every stone radiates outward, decaying with distance
 * and blocked by nothing. Positive means Black-leaning.
 *
 * This is an estimate for the "who is ahead?" bar and for bot move ordering —
 * not a score. Real scoring lives in score.ts and requires a finished game.
 */
export function influence(position: Position, radius = 4): Float32Array {
  const { size, area } = position.geo;
  const field = new Float32Array(area);

  for (let v = 0; v < area; v++) {
    const stone = position.stones[v];
    if (stone === EMPTY) continue;
    const sign = stone === BLACK ? 1 : -1;
    const sx = v % size;
    const sy = Math.floor(v / size);

    const minY = Math.max(0, sy - radius);
    const maxY = Math.min(size - 1, sy + radius);
    const minX = Math.max(0, sx - radius);
    const maxX = Math.min(size - 1, sx + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.abs(x - sx) + Math.abs(y - sy);
        if (distance > radius) continue;
        field[y * size + x] += sign / (1 + distance * distance);
      }
    }
  }
  return field;
}

/**
 * Rough "who is ahead" reading in points, from influence over empty points plus
 * stones on the board. Signed: positive favours Black. Explicitly an estimate.
 */
export function estimateLead(position: Position, komi: number): number {
  const field = influence(position);
  let total = 0;
  for (let v = 0; v < position.area; v++) {
    const stone = position.stones[v];
    if (stone === BLACK) total += 1;
    else if (stone === WHITE) total -= 1;
    else {
      const f = field[v];
      // Only count empty points with a clear owner; contested points read as 0.
      if (f > 0.15) total += 1;
      else if (f < -0.15) total -= 1;
    }
  }
  return total - komi;
}
