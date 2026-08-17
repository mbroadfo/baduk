/** Core value types shared across the engine. Kept dependency-free and allocation-light. */

/** A player. Black moves first (except with handicap). */
export type Color = 1 | 2;

export const BLACK: Color = 1;
export const WHITE: Color = 2;

/** Contents of a single intersection. */
export type Stone = 0 | Color;

export const EMPTY = 0 as const;

/**
 * An intersection, stored as a flat index `y * size + x` with (0,0) at the
 * top-left — matching how the board is printed and how SGF coordinates run.
 */
export type Vertex = number;

export type Move =
  | { readonly type: 'play'; readonly vertex: Vertex }
  | { readonly type: 'pass' }
  | { readonly type: 'resign' };

export const PASS: Move = { type: 'pass' };
export const RESIGN: Move = { type: 'resign' };

export function play(vertex: Vertex): Move {
  return { type: 'play', vertex };
}

export function opponent(color: Color): Color {
  return color === BLACK ? WHITE : BLACK;
}

export function colorName(color: Color): 'Black' | 'White' {
  return color === BLACK ? 'Black' : 'White';
}

/** Why a move was rejected. Surfaced to the UI so it can teach, not just refuse. */
export type IllegalReason =
  | 'occupied'
  | 'off-board'
  | 'suicide'
  | 'ko'
  | 'superko'
  | 'game-over'
  | 'wrong-turn';

export class IllegalMoveError extends Error {
  constructor(
    readonly reason: IllegalReason,
    message?: string,
  ) {
    super(message ?? `Illegal move: ${reason}`);
    this.name = 'IllegalMoveError';
  }
}

/**
 * Rule set knobs. Defaults are the ones that make bot self-play well-defined:
 * area (Chinese) scoring with positional superko.
 */
export interface Rules {
  /** Points added to White's score to offset Black's first-move advantage. */
  readonly komi: number;
  /** Positional superko forbids recreating any earlier whole-board position. */
  readonly superko: boolean;
  /** Area (Chinese) counts stones + territory; territory (Japanese) counts territory + prisoners. */
  readonly scoring: 'area' | 'territory';
  /** Chinese rules permit multi-stone self-capture; almost every server forbids it. */
  readonly allowSuicide: boolean;
}

export const DEFAULT_RULES: Rules = {
  komi: 7.5,
  superko: true,
  scoring: 'area',
  allowSuicide: false,
};

/** Komi that keeps each board size close to a 50/50 game under area scoring. */
export function defaultKomi(size: number): number {
  if (size <= 9) return 5.5;
  if (size <= 13) return 6.5;
  return 7.5;
}
