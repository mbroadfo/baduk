import { formatVertex, type Color, type Game } from '@baduk/engine';
import { evaluateMoves, DEFAULT_WEIGHTS, type EvaluationWeights } from './evaluate.js';
import { PERSONAS } from './personas.js';
import { makeRandom, pickWeighted, type Bot, type BotMove } from './types.js';

/**
 * Pebble — plays a random legal move, but refuses to fill its own eyes so it
 * does not self-destruct. The floor of the ladder: a learner who cannot beat
 * Pebble does not yet know the rules, and that is fine.
 */
export class RandomBot implements Bot {
  readonly persona = PERSONAS.pebble;
  private readonly rand: () => number;

  constructor(seed = Date.now()) {
    this.rand = makeRandom(seed);
  }

  selectMove(game: Game, color: Color): BotMove {
    const moves = game
      .legalMoves(color)
      .filter((v) => !game.position.isTrueEye(v, color));

    if (moves.length === 0) {
      return { move: { type: 'pass' }, rationale: 'No sensible moves left, so Pebble passes.' };
    }
    const vertex = moves[Math.floor(this.rand() * moves.length)];
    return {
      move: { type: 'play', vertex },
      rationale: `Pebble plays ${formatVertex(game.size, vertex)} for no particular reason.`,
    };
  }
}

/**
 * A persona driven directly by the transparent evaluator, with a `temperature`
 * that decides how often it takes something other than its top choice.
 *
 * Temperature is what makes these opponents good teachers rather than just weak
 * ones: a bot that always plays its best move is predictable, and one that
 * blunders at random is noise. Sampling near the top gives a learner a
 * consistent style to read.
 */
export class HeuristicBot implements Bot {
  private readonly rand: () => number;

  constructor(
    readonly persona = PERSONAS.sprout,
    private readonly options: {
      /** 0 = always the best move; higher = more willing to wander. */
      temperature?: number;
      /** How many top moves are eligible to be sampled. */
      breadth?: number;
      weights?: EvaluationWeights;
      seed?: number;
    } = {},
  ) {
    this.rand = makeRandom(options.seed ?? Date.now());
  }

  selectMove(game: Game, color: Color): BotMove {
    const weights = this.options.weights ?? DEFAULT_WEIGHTS;
    const breadth = this.options.breadth ?? 5;
    const temperature = this.options.temperature ?? 0.5;

    const candidates = evaluateMoves(game, color, { weights }).filter(
      (c) => !game.position.isTrueEye(c.vertex, color),
    );

    if (candidates.length === 0) {
      return {
        move: { type: 'pass' },
        rationale: `${this.persona.name} has no useful move left and passes.`,
      };
    }

    // Pass once every remaining move actively hurts — otherwise the endgame
    // degenerates into filling in your own territory.
    const best = candidates[0];
    if (best.score < 0 && game.moveCount > game.size * 2) {
      return {
        move: { type: 'pass' },
        rationale: `${this.persona.name} sees nothing left worth playing, so it passes.`,
      };
    }

    const pool = candidates.slice(0, breadth);
    const chosen =
      temperature <= 0
        ? best
        : pickWeighted(
            pool,
            pool.map((c) => Math.exp((c.score - best.score) / (temperature * 10))),
            this.rand,
          );

    return {
      move: { type: 'play', vertex: chosen.vertex },
      rationale: `${formatVertex(game.size, chosen.vertex)} — ${chosen.reason}`,
      considered: pool,
    };
  }
}

/** Sprout: tactical, greedy, and happy to be led around the board. */
export function createSprout(seed?: number): HeuristicBot {
  return new HeuristicBot(PERSONAS.sprout, {
    temperature: 0.9,
    breadth: 6,
    ...(seed === undefined ? {} : { seed }),
    weights: { ...DEFAULT_WEIGHTS, capture: 20, atari: 9, corner: 2, influence: 0.5 },
  });
}

/** Kaze: values shape and direction of play over grabbing stones. */
export function createKaze(seed?: number): HeuristicBot {
  return new HeuristicBot(PERSONAS.kaze, {
    temperature: 0.3,
    breadth: 4,
    ...(seed === undefined ? {} : { seed }),
    weights: { ...DEFAULT_WEIGHTS, corner: 12, influence: 3, contact: 1.5, firstLine: -9 },
  });
}
