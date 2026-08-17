import {
  BLACK,
  Game,
  formatVertex,
  opponent,
  type Color,
  type Move,
  type Vertex,
} from '@baduk/engine';
import { contextFromGame, evaluateMoves, explainMove } from '@baduk/bots';
import { CONCEPTS, type ConceptId } from './concepts.js';

/**
 * Post-game review.
 *
 * The single most effective teaching tool in Go is going back through the game
 * and finding the two or three moves that actually decided it. Beginners
 * usually cannot do this alone — they remember the dramatic capture, not the
 * quiet move that made it possible.
 *
 * Reviews are deliberately sparse: flagging forty mistakes teaches nothing.
 */

export type Grade = 'good' | 'fine' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveReview {
  /** 1-based move number, as shown on the board. */
  readonly number: number;
  readonly color: Color;
  readonly move: Move;
  readonly grade: Grade;
  /** How far this move fell short of the coach's top choice. */
  readonly lostValue: number;
  /** Rank of the played move in the coach's list, 1 = the coach agreed. */
  readonly rank: number;
  readonly comment: string;
  readonly betterMove?: Vertex;
  readonly betterReason?: string;
  readonly concept?: ConceptId;
}

export interface GameReview {
  readonly moves: readonly MoveReview[];
  /** The handful worth actually talking about, worst first. */
  readonly keyMoments: readonly MoveReview[];
  readonly summary: string;
  /** Concepts to study next, most frequently missed first. */
  readonly studyNext: readonly ConceptId[];
  readonly accuracy: Record<'black' | 'white', number>;
}

const GRADE_THRESHOLDS: ReadonlyArray<{ grade: Grade; maxLoss: number }> = [
  { grade: 'good', maxLoss: 2 },
  { grade: 'fine', maxLoss: 8 },
  { grade: 'inaccuracy', maxLoss: 18 },
  { grade: 'mistake', maxLoss: 35 },
  { grade: 'blunder', maxLoss: Number.POSITIVE_INFINITY },
];

function gradeFor(lostValue: number): Grade {
  for (const { grade, maxLoss } of GRADE_THRESHOLDS) {
    if (lostValue <= maxLoss) return grade;
  }
  return 'blunder';
}

export interface ReviewOptions {
  /** Only review this player's moves — usually the learner's. */
  readonly forColor?: Color;
  /** How many key moments to surface. */
  readonly keyMoments?: number;
}

/**
 * Replays the game and grades each move against the coach's own evaluation.
 *
 * "Lost value" is the gap between the coach's top move and the move played, in
 * the evaluator's units. Those units are not points — the review says so — but
 * the ordering is meaningful, which is all a learner needs to find the moments
 * worth revisiting.
 */
export function reviewGame(finished: Game, options: ReviewOptions = {}): GameReview {
  const keyCount = options.keyMoments ?? 3;
  const reviews: MoveReview[] = [];

  const replay = new Game({
    size: finished.size,
    rules: finished.rules,
    handicap: finished.handicap,
  });

  for (const [index, record] of finished.history.entries()) {
    const { color, move } = record;
    const shouldGrade = options.forColor === undefined || options.forColor === color;

    if (move.type === 'play' && shouldGrade) {
      const ranked = evaluateMoves(replay, color);
      const best = ranked[0];
      const played = explainMove(contextFromGame(replay), move.vertex, color);
      const rank = ranked.findIndex((c) => c.vertex === move.vertex) + 1;
      const lostValue = best ? Math.max(0, best.score - played.score) : 0;
      const grade = gradeFor(lostValue);
      const concept = conceptFor(played.terms, grade);

      reviews.push({
        number: index + 1,
        color,
        move,
        grade,
        lostValue,
        rank: rank > 0 ? rank : ranked.length + 1,
        comment: commentFor(grade, finished.size, move.vertex, played.terms, best?.vertex),
        ...(best && best.vertex !== move.vertex
          ? { betterMove: best.vertex, betterReason: best.reason }
          : {}),
        ...(concept ? { concept } : {}),
      });
    }

    try {
      replay.play(record.move);
    } catch {
      // The record and the replay disagree — stop rather than report nonsense.
      break;
    }
  }

  const keyMoments = reviews
    .filter((r) => r.grade === 'mistake' || r.grade === 'blunder')
    .sort((a, b) => b.lostValue - a.lostValue)
    .slice(0, keyCount)
    .sort((a, b) => a.number - b.number);

  return {
    moves: reviews,
    keyMoments,
    summary: summarise(finished, reviews, keyMoments),
    studyNext: studyList(reviews),
    accuracy: {
      black: accuracyFor(reviews, BLACK),
      white: accuracyFor(reviews, opponent(BLACK)),
    },
  };
}

function commentFor(
  grade: Grade,
  size: number,
  vertex: Vertex,
  terms: ReadonlyArray<{ score: number; reason: string }>,
  bestVertex?: Vertex,
): string {
  const label = formatVertex(size, vertex);
  const worst = terms.slice().sort((a, b) => a.score - b.score)[0];

  switch (grade) {
    case 'good':
      return `${label} — this is what the coach would have played.`;
    case 'fine':
      return `${label} is reasonable. Not the top choice, but nothing is lost.`;
    case 'inaccuracy':
      return `${label} is slightly loose.${bestVertex !== undefined ? ` ${formatVertex(size, bestVertex)} does more.` : ''}`;
    case 'mistake':
      return worst && worst.score < 0
        ? `${label} — ${worst.reason}`
        : `${label} misses something bigger elsewhere on the board.`;
    case 'blunder':
      return worst && worst.score < 0
        ? `${label} is the move that cost you most. ${worst.reason}`
        : `${label} was the turning point — there was far more available elsewhere.`;
  }
}

/** Maps the evaluator's reasons back to a curriculum concept worth studying. */
function conceptFor(
  terms: ReadonlyArray<{ score: number; reason: string }>,
  grade: Grade,
): ConceptId | undefined {
  if (grade === 'good' || grade === 'fine') return undefined;
  const text = terms.map((t) => t.reason).join(' ');
  if (/[Ss]elf-atari/.test(text)) return 'self-atari';
  if (/own eye/.test(text)) return 'eyes';
  if (/ladder/.test(text)) return 'ladder';
  if (/atari/.test(text)) return 'atari';
  if (/[Cc]aptures/.test(text)) return 'capture';
  if (/[Cc]orners/.test(text)) return 'corners-first';
  return 'territory';
}

function accuracyFor(reviews: readonly MoveReview[], color: Color): number {
  const mine = reviews.filter((r) => r.color === color);
  if (mine.length === 0) return 100;
  const solid = mine.filter((r) => r.grade === 'good' || r.grade === 'fine').length;
  return Math.round((solid / mine.length) * 100);
}

function studyList(reviews: readonly MoveReview[]): ConceptId[] {
  const counts = new Map<ConceptId, number>();
  for (const review of reviews) {
    if (!review.concept) continue;
    if (review.grade === 'good' || review.grade === 'fine') continue;
    counts.set(review.concept, (counts.get(review.concept) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
}

function summarise(
  game: Game,
  reviews: readonly MoveReview[],
  keyMoments: readonly MoveReview[],
): string {
  const result = game.result;
  const opening = result ? `The game finished ${result.text}.` : 'The game is unfinished.';

  if (reviews.length === 0) return `${opening} There are no moves to review yet.`;
  if (keyMoments.length === 0) {
    return `${opening} No single move stands out as the one that decided it — the difference came from lots of small choices, which is a good sign.`;
  }

  const first = keyMoments[0];
  const concept = first.concept ? CONCEPTS[first.concept] : undefined;
  return [
    opening,
    `The move worth revisiting is number ${first.number}: ${first.comment}`,
    concept ? `The idea behind it is ${concept.title.toLowerCase()} — ${concept.summary}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
