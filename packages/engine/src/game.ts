import { Position } from './position.js';
import { formatResult, score, type ScoreBreakdown } from './score.js';
import {
  BLACK,
  DEFAULT_RULES,
  IllegalMoveError,
  WHITE,
  colorName,
  defaultKomi,
  opponent,
  type Color,
  type IllegalReason,
  type Move,
  type Rules,
  type Vertex,
} from './types.js';
import { hashKey } from './zobrist.js';

export interface MoveRecord {
  readonly move: Move;
  readonly color: Color;
  readonly captured: readonly Vertex[];
  /** The position *after* this move. */
  readonly position: Position;
  /** Free-form annotation — the coach writes its commentary here. */
  comment?: string;
}

export type EndReason = 'passes' | 'resign' | 'forfeit';

export interface GameResult {
  readonly winner: Color | null;
  readonly reason: EndReason;
  /** Standard notation, e.g. `B+7.5` or `W+R`. */
  readonly text: string;
  readonly score?: ScoreBreakdown;
}

export interface GameOptions {
  readonly size?: number;
  readonly rules?: Partial<Rules>;
  /** Free stones for Black, placed on the star points. White moves first. */
  readonly handicap?: number;
}

/**
 * A full game: move history, ko/superko enforcement, end conditions and result.
 *
 * The Game owns history because superko is a property of the whole game, not of
 * any single position. Everything is retained so the review screen can walk
 * back through the game move by move.
 */
export class Game {
  readonly size: number;
  readonly rules: Rules;
  readonly handicap: number;

  private readonly positions: Position[];
  private readonly records: MoveRecord[] = [];
  private readonly seen = new Map<string, number>();
  private ended: GameResult | null = null;

  constructor(options: GameOptions = {}) {
    this.size = options.size ?? 9;
    this.rules = {
      ...DEFAULT_RULES,
      komi: options.rules?.komi ?? defaultKomi(this.size),
      ...options.rules,
    };
    this.handicap = options.handicap ?? 0;

    let start = Position.empty(this.size, BLACK);
    if (this.handicap >= 2) {
      const points = handicapPoints(this.size, this.handicap);
      start = start
        .withSetup(points.map((vertex) => ({ vertex, color: BLACK as Color })))
        .withToPlay(WHITE);
    }
    this.positions = [start];
    this.seen.set(hashKey(start.hash), 1);
  }

  get position(): Position {
    return this.positions[this.positions.length - 1];
  }

  get toPlay(): Color {
    return this.position.toPlay;
  }

  get moveCount(): number {
    return this.records.length;
  }

  get history(): readonly MoveRecord[] {
    return this.records;
  }

  get isOver(): boolean {
    return this.ended !== null;
  }

  get result(): GameResult | null {
    return this.ended;
  }

  /** The position after `n` moves — for the review scrubber. */
  positionAt(n: number): Position {
    return this.positions[Math.max(0, Math.min(n, this.positions.length - 1))];
  }

  /** Superko-aware legality, which is the check the UI should use. */
  illegalReason(move: Move, color: Color = this.toPlay): IllegalReason | null {
    if (this.ended) return 'game-over';
    if (color !== this.toPlay) return 'wrong-turn';
    const basic = this.position.illegalReason(move, color);
    if (basic) return basic;
    if (move.type === 'play' && this.rules.superko) {
      const next = this.position.play(move, color).position;
      if (this.seen.has(hashKey(next.hash))) return 'superko';
    }
    return null;
  }

  isLegal(move: Move, color: Color = this.toPlay): boolean {
    return this.illegalReason(move, color) === null;
  }

  legalMoves(color: Color = this.toPlay): Vertex[] {
    if (this.ended) return [];
    return this.position
      .legalMoves(color)
      .filter((v) => this.illegalReason({ type: 'play', vertex: v }, color) === null);
  }

  play(move: Move): MoveRecord {
    const color = this.toPlay;
    const reason = this.illegalReason(move, color);
    if (reason) throw new IllegalMoveError(reason);

    if (move.type === 'resign') {
      const winner = opponent(color);
      this.ended = {
        winner,
        reason: 'resign',
        text: `${winner === BLACK ? 'B' : 'W'}+R`,
      };
      const record: MoveRecord = {
        move,
        color,
        captured: [],
        position: this.position,
      };
      this.records.push(record);
      return record;
    }

    const { position, captured } = this.position.play(move, color);
    this.positions.push(position);
    const key = hashKey(position.hash);
    this.seen.set(key, (this.seen.get(key) ?? 0) + 1);

    const record: MoveRecord = { move, color, captured, position };
    this.records.push(record);

    if (move.type === 'pass' && this.lastTwoWerePasses()) this.finishByScore();
    return record;
  }

  pass(): MoveRecord {
    return this.play({ type: 'pass' });
  }

  resign(): MoveRecord {
    return this.play({ type: 'resign' });
  }

  /**
   * Takes back one move. Teaching tool first, so it is always available —
   * including after the game ends, which is how a review turns into a "try that
   * differently" branch.
   */
  undo(): MoveRecord | null {
    const record = this.records.pop();
    if (!record) return null;
    this.ended = null;
    if (record.move.type !== 'resign') {
      const removed = this.positions.pop();
      if (removed) {
        const key = hashKey(removed.hash);
        const count = (this.seen.get(key) ?? 1) - 1;
        if (count <= 0) this.seen.delete(key);
        else this.seen.set(key, count);
      }
    }
    return record;
  }

  /** Ends the game immediately, e.g. a bot that failed to move in time. */
  forfeit(loser: Color, note = 'forfeit'): GameResult {
    const winner = opponent(loser);
    this.ended = {
      winner,
      reason: 'forfeit',
      text: `${winner === BLACK ? 'B' : 'W'}+F (${note})`,
    };
    return this.ended;
  }

  /** Current score if the game stopped now. Assumes all stones are alive. */
  score(): ScoreBreakdown {
    return score(this.position, this.rules);
  }

  private lastTwoWerePasses(): boolean {
    const n = this.records.length;
    return (
      n >= 2 && this.records[n - 1].move.type === 'pass' && this.records[n - 2].move.type === 'pass'
    );
  }

  private finishByScore(): void {
    const breakdown = this.score();
    this.ended = {
      winner: breakdown.winner,
      reason: 'passes',
      text: formatResult(breakdown),
      score: breakdown,
    };
  }

  /** One-line status for CLI output and the game log. */
  describe(): string {
    if (this.ended) return `Game over — ${this.ended.text}`;
    return `Move ${this.moveCount + 1}: ${colorName(this.toPlay)} to play`;
  }
}

/**
 * Standard handicap placement. Corners first, then the sides, with tengen taken
 * on odd counts — the ordering every server and book uses.
 */
export function handicapPoints(size: number, count: number): Vertex[] {
  if (size < 7 || count < 2) return [];

  const edge = size >= 13 ? 3 : 2;
  const far = size - 1 - edge;
  const mid = (size - 1) / 2;
  const at = (x: number, y: number): Vertex => y * size + x;

  // Diagonally opposite corners first, so 2 and 3 stones look conventional.
  const corners = [at(edge, far), at(far, edge), at(far, far), at(edge, edge)];
  const hasCentre = Number.isInteger(mid);
  const sides = hasCentre ? [at(edge, mid), at(far, mid), at(mid, far), at(mid, edge)] : [];

  const n = Math.min(count, hasCentre ? 9 : 8);
  const picks: Vertex[] = corners.slice(0, Math.min(n, 4));
  if (n >= 5) {
    // Odd handicaps above four take tengen; the rest fill the side stars.
    const takesCentre = n % 2 === 1 && hasCentre;
    picks.push(...sides.slice(0, n - 4 - (takesCentre ? 1 : 0)));
    if (takesCentre) picks.push(at(mid, mid));
  }
  return picks;
}
