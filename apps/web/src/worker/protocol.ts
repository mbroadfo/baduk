import type { Move, Vertex } from '@baduk/engine';

/** Everything the worker needs to rebuild the game and pick a move. */
export interface BotRequest {
  readonly id: number;
  readonly botId: string;
  readonly size: number;
  readonly komi: number;
  readonly handicap: number;
  readonly moves: readonly Move[];
  readonly thinkMs: number;
  readonly seed?: number;
}

export interface ConsideredMove {
  readonly vertex: Vertex;
  readonly reason: string;
}

export type BotResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly move: Move;
      readonly rationale: string;
      readonly considered: readonly ConsideredMove[];
    }
  | { readonly id: number; readonly ok: false; readonly error: string };
