import { geometry, type Geometry } from './board.js';
import {
  BLACK,
  EMPTY,
  IllegalMoveError,
  WHITE,
  opponent,
  type Color,
  type IllegalReason,
  type Move,
  type Stone,
  type Vertex,
} from './types.js';
import {
  ZERO_HASH,
  toggleStone,
  toggleTurn,
  zobristTable,
  type Hash,
  type ZobristTable,
} from './zobrist.js';

/** A connected group of same-coloured stones and the empty points touching it. */
export interface Group {
  readonly color: Color;
  readonly stones: Vertex[];
  readonly liberties: Vertex[];
}

export interface PlayResult {
  readonly position: Position;
  /** Opponent stones removed by this move. */
  readonly captured: Vertex[];
}

/**
 * An immutable whole-board state. Every move returns a new Position, which is
 * what lets the UI scrub history, the coach compare "what if" lines, and MCTS
 * branch without defensive copying.
 */
export class Position {
  readonly geo: Geometry;

  private constructor(
    readonly size: number,
    readonly stones: Uint8Array,
    readonly toPlay: Color,
    /** Stones captured *by* [black, white]. */
    readonly captures: readonly [number, number],
    /** The single point banned by the simple ko rule, if any. */
    readonly koPoint: Vertex | null,
    readonly hash: Hash,
  ) {
    this.geo = geometry(size);
  }

  static empty(size: number, toPlay: Color = BLACK): Position {
    const geo = geometry(size);
    const table = zobristTable(size);
    let hash = ZERO_HASH;
    if (toPlay === WHITE) hash = toggleTurn(hash, table);
    return new Position(size, new Uint8Array(geo.area), toPlay, [0, 0], null, hash);
  }

  get area(): number {
    return this.geo.area;
  }

  at(v: Vertex): Stone {
    return this.stones[v] as Stone;
  }

  private get table(): ZobristTable {
    return zobristTable(this.size);
  }

  /** Replaces whose turn it is without playing a move (handicap, setup, editing). */
  withToPlay(color: Color): Position {
    if (color === this.toPlay) return this;
    return new Position(
      this.size,
      this.stones,
      color,
      this.captures,
      this.koPoint,
      toggleTurn(this.hash, this.table),
    );
  }

  /** Places stones with no capture or legality checks — for handicap and puzzles. */
  withSetup(placements: ReadonlyArray<{ vertex: Vertex; color: Color }>): Position {
    const stones = Uint8Array.from(this.stones);
    let hash = this.hash;
    const table = this.table;
    for (const { vertex, color } of placements) {
      const existing = stones[vertex] as Stone;
      if (existing !== EMPTY) hash = toggleStone(hash, table, existing, vertex);
      stones[vertex] = color;
      hash = toggleStone(hash, table, color, vertex);
    }
    return new Position(this.size, stones, this.toPlay, this.captures, null, hash);
  }

  /**
   * Flood-fills the group containing `v`.
   * Returns null for an empty point, so callers can branch on occupancy in one step.
   */
  group(v: Vertex): Group | null {
    const color = this.stones[v] as Stone;
    if (color === EMPTY) return null;

    const { nbr, off } = this.geo;
    const stones: Vertex[] = [v];
    const liberties: Vertex[] = [];
    const seen = new Uint8Array(this.geo.area);
    const libSeen = new Uint8Array(this.geo.area);
    seen[v] = 1;

    for (let i = 0; i < stones.length; i++) {
      const cur = stones[i];
      for (let k = off[cur]; k < off[cur + 1]; k++) {
        const n = nbr[k];
        const s = this.stones[n];
        if (s === EMPTY) {
          if (!libSeen[n]) {
            libSeen[n] = 1;
            liberties.push(n);
          }
        } else if (s === color && !seen[n]) {
          seen[n] = 1;
          stones.push(n);
        }
      }
    }
    return { color, stones, liberties };
  }

  /** Liberty count of the group at `v`, without materialising the group. */
  libertyCount(v: Vertex): number {
    return this.group(v)?.liberties.length ?? 0;
  }

  /**
   * True if `v` is surrounded by `color` on all orthogonal neighbours — the
   * cheap "don't fill your own eye" test every playout policy needs.
   * Deliberately ignores diagonals, so it is a lower bound on real eyes.
   */
  isEyeLike(v: Vertex, color: Color): boolean {
    if (this.stones[v] !== EMPTY) return false;
    const { nbr, off } = this.geo;
    for (let k = off[v]; k < off[v + 1]; k++) {
      if (this.stones[nbr[k]] !== color) return false;
    }
    return true;
  }

  /**
   * A stricter eye test that also requires control of the diagonals, which is
   * what actually makes an eye safe. Used by bots so they stop passing on
   * one-eyed groups, and by the coach when explaining life and death.
   */
  isTrueEye(v: Vertex, color: Color): boolean {
    if (!this.isEyeLike(v, color)) return false;
    const size = this.size;
    const x = v % size;
    const y = Math.floor(v / size);
    let hostile = 0;
    let diagonals = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      diagonals++;
      if (this.stones[ny * size + nx] === opponent(color)) hostile++;
    }
    // On the edge every diagonal must be friendly; in the centre one may be lost.
    return diagonals < 4 ? hostile === 0 : hostile <= 1;
  }

  /** Why this move is illegal, or null if it is playable. Ignores superko (Game owns history). */
  illegalReason(move: Move, color: Color = this.toPlay): IllegalReason | null {
    if (move.type !== 'play') return null;
    const v = move.vertex;
    if (!Number.isInteger(v) || v < 0 || v >= this.geo.area) return 'off-board';
    if (this.stones[v] !== EMPTY) return 'occupied';
    if (this.koPoint === v) return 'ko';

    const { nbr, off } = this.geo;
    const foe = opponent(color);

    // Cheap accept: any adjacent empty point means the new stone has a liberty.
    for (let k = off[v]; k < off[v + 1]; k++) {
      const n = nbr[k];
      const s = this.stones[n];
      if (s === EMPTY) return null;
      if (s === foe && this.libertyCount(n) === 1) return null; // captures something
      if (s === color && this.libertyCount(n) > 1) return null; // connects to a live group
    }
    return 'suicide';
  }

  isLegal(move: Move, color: Color = this.toPlay): boolean {
    return this.illegalReason(move, color) === null;
  }

  /**
   * Plays a stone, removing captures. Throws on an illegal move — callers that
   * are probing should ask `isLegal` first (or use `tryPlay`).
   */
  play(move: Move, color: Color = this.toPlay): PlayResult {
    if (move.type !== 'play') {
      return {
        position: new Position(
          this.size,
          this.stones,
          opponent(color),
          this.captures,
          null,
          toggleTurn(this.hash, this.table),
        ),
        captured: [],
      };
    }

    const reason = this.illegalReason(move, color);
    if (reason) throw new IllegalMoveError(reason);

    const v = move.vertex;
    const table = this.table;
    const stones = Uint8Array.from(this.stones);
    let hash = toggleStone(this.hash, table, color, v);
    stones[v] = color;

    const foe = opponent(color);
    const { nbr, off } = this.geo;
    const captured: Vertex[] = [];

    for (let k = off[v]; k < off[v + 1]; k++) {
      const n = nbr[k];
      if (stones[n] !== foe) continue;
      const grp = groupIn(stones, this.geo, n);
      if (grp.liberties.length > 0) continue;
      for (const s of grp.stones) {
        if (stones[s] === EMPTY) continue;
        stones[s] = EMPTY;
        hash = toggleStone(hash, table, foe, s);
        captured.push(s);
      }
    }

    // Self-capture is only reachable when the rules allow it; illegalReason
    // rejects it otherwise.
    const own = groupIn(stones, this.geo, v);
    if (own.liberties.length === 0) {
      for (const s of own.stones) {
        stones[s] = EMPTY;
        hash = toggleStone(hash, table, color, s);
      }
    }

    const captures: [number, number] = [this.captures[0], this.captures[1]];
    captures[color - 1] += captured.length;

    // Simple ko: exactly one stone taken by a lone stone that now has one
    // liberty — the only shape that can immediately be recaptured.
    const koPoint =
      captured.length === 1 && own.stones.length === 1 && own.liberties.length === 1
        ? captured[0]
        : null;

    hash = toggleTurn(hash, table);
    return {
      position: new Position(this.size, stones, foe, captures, koPoint, hash),
      captured,
    };
  }

  tryPlay(move: Move, color: Color = this.toPlay): PlayResult | null {
    return this.isLegal(move, color) ? this.play(move, color) : null;
  }

  /** All legal plays for `color`. Excludes passing, which is always available. */
  legalMoves(color: Color = this.toPlay): Vertex[] {
    const moves: Vertex[] = [];
    for (let v = 0; v < this.geo.area; v++) {
      if (this.stones[v] !== EMPTY) continue;
      if (this.illegalReason({ type: 'play', vertex: v }, color) === null) moves.push(v);
    }
    return moves;
  }

  /** ASCII rendering — used by the arena CLI, snapshot tests, and bug reports. */
  toString(): string {
    const rows: string[] = [];
    const labels = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.slice(0, this.size).split('').join(' ');
    rows.push(`   ${labels}`);
    for (let y = 0; y < this.size; y++) {
      const cells: string[] = [];
      for (let x = 0; x < this.size; x++) {
        const s = this.stones[y * this.size + x];
        cells.push(s === BLACK ? 'X' : s === WHITE ? 'O' : '.');
      }
      rows.push(`${String(this.size - y).padStart(2)} ${cells.join(' ')}`);
    }
    return rows.join('\n');
  }
}

/** Group flood fill over a raw stone array — used mid-mutation inside `play`. */
function groupIn(stones: Uint8Array, geo: Geometry, v: Vertex): Group {
  const color = stones[v] as Color;
  const { nbr, off } = geo;
  const out: Vertex[] = [v];
  const liberties: Vertex[] = [];
  const seen = new Uint8Array(geo.area);
  const libSeen = new Uint8Array(geo.area);
  seen[v] = 1;

  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    for (let k = off[cur]; k < off[cur + 1]; k++) {
      const n = nbr[k];
      const s = stones[n];
      if (s === EMPTY) {
        if (!libSeen[n]) {
          libSeen[n] = 1;
          liberties.push(n);
        }
      } else if (s === color && !seen[n]) {
        seen[n] = 1;
        out.push(n);
      }
    }
  }
  return { color, stones: out, liberties };
}
