import type { Color, Game, Move, Vertex } from '@baduk/engine';

/**
 * A bot is a teaching partner first and an opponent second. Every bot must be
 * able to say *why* it played — `rationale` is not optional decoration, it is
 * what turns a game into a lesson.
 */
export interface Bot {
  readonly persona: Persona;
  /** Choose a move for `color` in the current game state. */
  selectMove(game: Game, color: Color): Promise<BotMove> | BotMove;
}

export interface BotMove {
  readonly move: Move;
  /** One sentence a beginner can act on. Shown in the game log. */
  readonly rationale: string;
  /** Other moves considered, best first — feeds the "what else?" panel. */
  readonly considered?: readonly CandidateMove[];
}

export interface CandidateMove {
  readonly vertex: Vertex;
  /** Higher is better. Scale is bot-specific; only the ordering is meaningful. */
  readonly score: number;
  readonly reason: string;
}

/**
 * The face and personality of an opponent. Learners bond with characters far
 * more readily than with difficulty sliders, so each bot gets a name, a look,
 * and an honest description of what it is good and bad at.
 */
export interface Persona {
  readonly id: string;
  readonly name: string;
  /** Emoji avatar — cheap, universal, and works offline. */
  readonly avatar: string;
  /** Approximate playing strength, in the ranks a learner will recognise. */
  readonly rank: string;
  /** One line of character. */
  readonly tagline: string;
  /** What playing this opponent will teach you. */
  readonly teaches: string;
  /** Honest statement of the bot's blind spots. */
  readonly weakness: string;
  readonly accent: string;
  /** Rough ordering for the opponent picker, 0 = gentlest. */
  readonly difficulty: number;
}

/** Deterministic PRNG so a bot's game can be replayed exactly from a seed. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 0x100000000;
  };
}

export function pickWeighted<T>(items: readonly T[], weights: readonly number[], rand: () => number): T {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let roll = rand() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
