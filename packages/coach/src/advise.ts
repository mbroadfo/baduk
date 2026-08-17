import {
  formatVertex,
  groupsInAtari,
  capturingMoves,
  type Color,
  type Game,
  type Vertex,
} from '@baduk/engine';
import { evaluateMoves, type CandidateMove } from '@baduk/bots';
import type { ConceptId } from './concepts.js';

/**
 * Graduated hints.
 *
 * Handing a learner the best move teaches them to ask for the best move. So the
 * coach gives away as little as it can: first *that* something matters, then
 * *where* to look, and only then the move itself. The tiers are explicit so the
 * UI can make the learner click twice to get the answer — that pause is the
 * moment they actually think.
 */
export type HintLevel = 'nudge' | 'area' | 'move';

export const HINT_LEVELS: readonly HintLevel[] = ['nudge', 'area', 'move'];

export interface Advice {
  readonly level: HintLevel;
  readonly headline: string;
  readonly detail: string;
  /** Only present at the `move` level — this is the answer. */
  readonly vertex?: Vertex;
  /** Region to highlight at the `area` level. */
  readonly region?: readonly Vertex[];
  readonly concept?: ConceptId;
  /** The full ranked list, for a "show me the alternatives" panel. */
  readonly alternatives: readonly CandidateMove[];
}

export interface AdviseOptions {
  readonly level?: HintLevel;
  /** How many alternatives to include. */
  readonly alternatives?: number;
}

/**
 * The coach's recommendation for `color` in the current position.
 *
 * Note that the advice comes from the same evaluator the bots play with. That
 * is a deliberate limit and it is stated in the UI: this coach is a solid
 * club-level guide, not a professional. It is honest about being wrong, which
 * is more useful to a beginner than a black box that is right.
 */
export function advise(game: Game, color: Color, options: AdviseOptions = {}): Advice {
  const level = options.level ?? 'nudge';
  const limit = options.alternatives ?? 5;
  const size = game.size;

  // Never recommend filling your own eye. The evaluator scores it heavily
  // negative, but by the late endgame every remaining move is negative and the
  // least-bad one can still be an eye — so it is excluded outright rather than
  // merely discouraged. Advising it would contradict the coach's own lesson.
  const ranked = evaluateMoves(game, color).filter(
    (candidate) => !game.position.isTrueEye(candidate.vertex, color),
  );
  const alternatives = ranked.slice(0, limit);
  const best = ranked[0];

  if (!best) {
    return {
      level,
      headline: 'There is nothing left to play',
      detail:
        'Every remaining point is inside your own territory, and filling those only costs you points. Passing is correct here — when both players pass, the game is scored.',
      concept: 'endgame',
      alternatives: [],
    };
  }

  // Everything left actively loses ground: the honest advice is to stop.
  if (best.score < 0) {
    return {
      level,
      headline: 'This is a good moment to pass',
      detail:
        'Nothing on the board gains you anything now — the borders are settled, and every move left would fill your own territory or throw away a stone. Passing is a move, and here it is the best one.',
      concept: 'endgame',
      alternatives,
    };
  }

  const { theme, concept, region } = classify(game, color, best.vertex);

  if (level === 'nudge') {
    return {
      level,
      headline: theme.nudge,
      detail: theme.nudgeDetail,
      ...(concept ? { concept } : {}),
      alternatives,
    };
  }

  if (level === 'area') {
    return {
      level,
      headline: theme.area,
      detail: `${theme.areaDetail} Look around ${formatVertex(size, best.vertex)}’s neighbourhood — the highlighted points are where the coach is looking.`,
      region,
      ...(concept ? { concept } : {}),
      alternatives,
    };
  }

  return {
    level,
    headline: `Play ${formatVertex(size, best.vertex)}`,
    detail: best.reason,
    vertex: best.vertex,
    region,
    ...(concept ? { concept } : {}),
    alternatives,
  };
}

interface Theme {
  readonly nudge: string;
  readonly nudgeDetail: string;
  readonly area: string;
  readonly areaDetail: string;
}

/**
 * Works out what *kind* of position this is, so the vaguer hint levels can say
 * something true and useful without naming the move.
 */
function classify(
  game: Game,
  color: Color,
  bestVertex: Vertex,
): { theme: Theme; concept?: ConceptId; region: Vertex[] } {
  const position = game.position;
  const ownAtari = groupsInAtari(position, color);
  const captures = capturingMoves(position, color);
  const region = neighbourhood(game.size, bestVertex, 2);

  if (ownAtari.length > 0) {
    return {
      theme: {
        nudge: 'Something of yours is in danger',
        nudgeDetail:
          'Before you play anywhere else, check your own stones. One of your groups can be captured on your opponent’s next move.',
        area: 'Look at your group in atari',
        areaDetail: 'You need to decide whether to save these stones or let them go and take profit elsewhere.',
      },
      concept: 'atari',
      region: ownAtari.flatMap((g) => [...g.stones, ...g.liberties]),
    };
  }

  if (captures.length > 0) {
    return {
      theme: {
        nudge: 'There is something to take',
        nudgeDetail: 'Your opponent has left stones with only one liberty. Find them before playing elsewhere.',
        area: 'Look for stones with one liberty',
        areaDetail: 'Capturing here removes stones and gains you the points underneath.',
      },
      concept: 'capture',
      region: captures.map((c) => c.vertex),
    };
  }

  if (game.moveCount < game.size * 1.5) {
    return {
      theme: {
        nudge: 'Think about where territory is cheapest',
        nudgeDetail:
          'Early in the game, ask which part of the board takes the fewest stones to surround. The edges help you there.',
        area: 'Play in an open corner',
        areaDetail: 'Corners need the fewest stones to enclose, so they are worth the most this early.',
      },
      concept: 'corners-first',
      region,
    };
  }

  return {
    theme: {
      nudge: 'Look for the biggest area still undecided',
      nudgeDetail:
        'No group is in immediate danger, so the question is where the board is still open. Find the boundary neither player has settled.',
      area: 'This part of the board is still up for grabs',
      areaDetail: 'Playing on the border between the two areas both grows yours and shrinks theirs.',
    },
    concept: 'territory',
    region,
  };
}

function neighbourhood(size: number, centre: Vertex, radius: number): Vertex[] {
  const cx = centre % size;
  const cy = Math.floor(centre / size);
  const points: Vertex[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(size - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(size - 1, cx + radius); x++) {
      points.push(y * size + x);
    }
  }
  return points;
}
