import {
  capturingMoves,
  groupsInAtari,
  isSelfAtari,
  ladderEscapes,
  libertiesAfter,
  opponent,
  formatVertex,
  type Color,
  type Game,
  type Position,
  type Vertex,
} from '@baduk/engine';
import type { CandidateMove } from './types.js';

/**
 * A transparent, hand-written move evaluator.
 *
 * Every term is a rule a human teacher would actually state out loud, and each
 * one carries the sentence it would be explained with. That is the whole point:
 * the bots pick moves with this, and the coach explains moves with this, so the
 * advice a learner gets is literally the reasoning the opponent used.
 *
 * It is not strong. It is legible. Strength comes from search on top (see
 * mcts.ts), which uses these scores as priors.
 */

export interface EvaluationWeights {
  readonly capture: number;
  readonly save: number;
  readonly atari: number;
  readonly selfAtari: number;
  readonly fillOwnEye: number;
  readonly corner: number;
  readonly contact: number;
  readonly firstLine: number;
  readonly influence: number;
}

export const DEFAULT_WEIGHTS: EvaluationWeights = {
  capture: 14,
  save: 11,
  atari: 5,
  selfAtari: -18,
  fillOwnEye: -60,
  corner: 6,
  contact: 2.5,
  firstLine: -5,
  influence: 1.5,
};

interface Term {
  readonly score: number;
  readonly reason: string;
}

/** Distance from the nearest edge — 0 on the first line. */
function edgeDistance(size: number, v: Vertex): number {
  const x = v % size;
  const y = Math.floor(v / size);
  return Math.min(x, y, size - 1 - x, size - 1 - y);
}

/** Chebyshev distance between two points, used for "near the last move". */
function distance(size: number, a: Vertex, b: Vertex): number {
  const ax = a % size;
  const ay = Math.floor(a / size);
  const bx = b % size;
  const by = Math.floor(b / size);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Everything the evaluator needs about the game so far. Kept separate from
 * `Game` so a position can be scored on its own — puzzles, "what if" branches
 * and tests all supply one of these directly.
 */
export interface MoveContext {
  readonly position: Position;
  readonly size: number;
  readonly moveCount: number;
  readonly lastMove: Vertex | null;
}

export function contextFromGame(game: Game): MoveContext {
  const last = game.history.at(-1);
  return {
    position: game.position,
    size: game.size,
    moveCount: game.moveCount,
    lastMove: last && last.move.type === 'play' ? last.move.vertex : null,
  };
}

/**
 * Scores one candidate move and returns every term that fired, so callers can
 * show the full reasoning rather than a bare number.
 */
export function explainMove(
  context: MoveContext,
  vertex: Vertex,
  color: Color,
  weights: EvaluationWeights = DEFAULT_WEIGHTS,
): { score: number; terms: Term[] } {
  const { position, size } = context;
  const foe = opponent(color);
  const terms: Term[] = [];

  const result = position.tryPlay({ type: 'play', vertex }, color);
  if (!result) return { score: Number.NEGATIVE_INFINITY, terms: [] };
  const after = result.position;
  const label = formatVertex(size, vertex);

  // --- Captures -----------------------------------------------------------
  if (result.captured.length > 0) {
    terms.push({
      score: weights.capture * result.captured.length,
      reason: `Captures ${result.captured.length} stone${result.captured.length === 1 ? '' : 's'}.`,
    });
  }

  // --- Rescuing your own groups -------------------------------------------
  const myAtari = groupsInAtari(position, color);
  for (const group of myAtari) {
    if (group.liberties[0] !== vertex) continue;
    const liberties = libertiesAfter(position, vertex, color);
    if (liberties >= 2) {
      terms.push({
        score: weights.save * group.stones.length,
        reason: `Saves ${group.stones.length} stone${group.stones.length === 1 ? '' : 's'} that were in atari — the group now has ${liberties} liberties.`,
      });
    } else if (!ladderEscapes(position, group)) {
      terms.push({
        score: weights.selfAtari,
        reason: `Running here does not work: the group stays in atari and gets caught in a ladder.`,
      });
    }
  }

  // --- Threatening the opponent -------------------------------------------
  let atariThreats = 0;
  for (const group of groupsInAtari(after, foe)) {
    // Only credit ataris this move actually created.
    if (position.group(group.stones[0])?.liberties.length === 1) continue;
    atariThreats += group.stones.length;
  }
  if (atariThreats > 0) {
    terms.push({
      score: weights.atari * atariThreats,
      reason: `Puts ${atariThreats} enemy stone${atariThreats === 1 ? '' : 's'} in atari — one more move and they are captured.`,
    });
  }

  // --- Blunders ------------------------------------------------------------
  if (isSelfAtari(position, vertex, color)) {
    const group = after.group(vertex);
    const size_ = group?.stones.length ?? 1;
    terms.push({
      score: weights.selfAtari * size_,
      reason: `Self-atari: after this, ${size_ === 1 ? 'the stone has' : `${size_} stones have`} only one liberty and can be captured immediately.`,
    });
  }
  if (position.isTrueEye(vertex, color)) {
    terms.push({
      score: weights.fillOwnEye,
      reason: `Fills your own eye — eyes are what keep a group alive, so this destroys your own safety.`,
    });
  }

  // --- Shape and direction -------------------------------------------------
  // Opening shape only speaks when nothing tactical is happening. A capture on
  // the first line still beats a textbook corner approach, and a learner who is
  // told otherwise will lose stones politely.
  const tacticalTermsFired = terms.length > 0;
  const edge = edgeDistance(size, vertex);
  const opening = context.moveCount < size * 1.5;
  if (opening && !tacticalTermsFired) {
    if (edge === 0) {
      terms.push({
        score: weights.firstLine,
        reason: `First line this early is small — stones on the edge surround very little territory.`,
      });
    } else if (edge === 2 || edge === 3) {
      const corner = Math.min(vertex % size, size - 1 - (vertex % size)) <= 3 &&
        Math.min(Math.floor(vertex / size), size - 1 - Math.floor(vertex / size)) <= 3;
      if (corner) {
        terms.push({
          score: weights.corner,
          reason: `Corners first: ${label} claims territory efficiently because two edges do the surrounding for you.`,
        });
      }
    }
  }

  if (context.lastMove !== null) {
    const d = distance(size, vertex, context.lastMove);
    if (d <= 2) {
      terms.push({
        score: weights.contact * (3 - d),
        reason: `Answers your opponent's last move nearby, keeping the initiative in this area.`,
      });
    }
  }

  // --- Territory ------------------------------------------------------------
  const liberties = after.libertyCount(vertex);
  if (liberties >= 4 && terms.length === 0) {
    terms.push({
      score: weights.influence,
      reason: `A calm, flexible move — the stone has ${liberties} liberties and is hard to attack.`,
    });
  }

  let score = 0;
  for (const term of terms) score += term.score;
  return { score, terms };
}

/**
 * Ranks all legal moves. `limit` caps the returned list, but scoring always
 * considers every legal move so nothing good is silently pruned away.
 */
export function evaluateMoves(
  game: Game,
  color: Color,
  options: { limit?: number; weights?: EvaluationWeights } = {},
): CandidateMove[] {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const context = contextFromGame(game);
  const candidates: CandidateMove[] = [];

  for (const vertex of game.legalMoves(color)) {
    const { score, terms } = explainMove(context, vertex, color, weights);
    if (!Number.isFinite(score)) continue;
    const reason =
      terms.length > 0
        ? terms
            .slice()
            .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
            .map((t) => t.reason)
            .join(' ')
        : `Plays at ${formatVertex(game.size, vertex)}.`;
    candidates.push({ vertex, score, reason });
  }

  candidates.sort((a, b) => b.score - a.score);
  return options.limit ? candidates.slice(0, options.limit) : candidates;
}

/** Quick check used to decide whether passing is reasonable. */
export function hasProductiveMove(game: Game, color: Color): boolean {
  if (capturingMoves(game.position, color).length > 0) return true;
  const best = evaluateMoves(game, color, { limit: 1 })[0];
  return best !== undefined && best.score > 0;
}
