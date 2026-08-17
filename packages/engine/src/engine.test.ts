import { describe, expect, it } from 'vitest';
import { Position } from './position.js';
import { Game, handicapPoints } from './game.js';
import { score, ownership } from './score.js';
import { fromSgf, toSgf } from './sgf.js';
import { formatVertex, parseVertex, geometry } from './board.js';
import { BLACK, WHITE, DEFAULT_RULES, IllegalMoveError, type Vertex } from './types.js';

const SIZE = 9;
const at = (label: string): Vertex => {
  const v = parseVertex(SIZE, label);
  if (v === null) throw new Error(`bad label ${label}`);
  return v;
};

/** Plays an alternating sequence from an empty board, allowing explicit passes. */
function playOut(labels: string[], size = SIZE): Game {
  const game = new Game({ size });
  for (const label of labels) {
    game.play(label === 'pass' ? { type: 'pass' } : { type: 'play', vertex: parseVertex(size, label)! });
  }
  return game;
}

describe('coordinates', () => {
  it('skips the letter I, as Go notation does', () => {
    expect(formatVertex(19, parseVertex(19, 'H1')!)).toBe('H1');
    expect(formatVertex(19, parseVertex(19, 'J1')!)).toBe('J1');
    expect(parseVertex(19, 'I5')).toBeNull();
  });

  it('numbers rows from the bottom', () => {
    expect(parseVertex(9, 'A9')).toBe(0);
    expect(parseVertex(9, 'A1')).toBe(72);
    expect(formatVertex(9, 0)).toBe('A9');
  });

  it('rejects off-board input instead of throwing', () => {
    expect(parseVertex(9, 'A10')).toBeNull();
    expect(parseVertex(9, 'K1')).toBeNull();
    expect(parseVertex(9, 'hello')).toBeNull();
  });
});

describe('geometry', () => {
  it('gives corners 2 neighbours and centre points 4', () => {
    const geo = geometry(9);
    const count = (v: number) => geo.off[v + 1] - geo.off[v];
    expect(count(0)).toBe(2);
    expect(count(4)).toBe(3); // top edge
    expect(count(40)).toBe(4); // centre
    expect(count(80)).toBe(2); // opposite corner
  });
});

describe('captures', () => {
  it('removes a surrounded single stone', () => {
    // Black surrounds a lone white stone on D4.
    const game = playOut(['D5', 'D4', 'C4', 'A1', 'E4', 'A2', 'D3']);
    expect(game.position.at(at('D4'))).toBe(0);
    expect(game.position.captures[BLACK - 1]).toBe(1);
  });

  it('removes a whole group at once', () => {
    // White plays a two-stone group at D4/D5, Black surrounds all six liberties.
    const game = playOut([
      'C4', 'D4', 'C5', 'D5', 'D3', 'A1', 'D6', 'A2', 'E4', 'A3', 'E5',
    ]);
    expect(game.position.at(at('D4'))).toBe(0);
    expect(game.position.at(at('D5'))).toBe(0);
    expect(game.position.captures[BLACK - 1]).toBe(2);
  });

  it('lets a move that captures be legal even with no liberties of its own', () => {
    // A9 is surrounded by white on both its neighbours, so the black stone has
    // no liberty of its own — it survives only because it takes B9.
    const pos = Position.empty(9, BLACK).withSetup([
      { vertex: at('B9'), color: WHITE },
      { vertex: at('A8'), color: WHITE },
      { vertex: at('C9'), color: BLACK },
      { vertex: at('B8'), color: BLACK },
    ]);
    expect(pos.isLegal({ type: 'play', vertex: at('A9') }, BLACK)).toBe(true);

    const after = pos.play({ type: 'play', vertex: at('A9') }, BLACK);
    expect(after.captured).toEqual([at('B9')]);
    expect(after.position.at(at('A9'))).toBe(BLACK);
    expect(after.position.libertyCount(at('A9'))).toBe(1); // the point it just took
  });
});

describe('suicide', () => {
  it('forbids filling your own last liberty', () => {
    const pos = Position.empty(9, WHITE).withSetup([
      { vertex: at('A8'), color: BLACK },
      { vertex: at('B9'), color: BLACK },
    ]);
    expect(pos.illegalReason({ type: 'play', vertex: at('A9') }, WHITE)).toBe('suicide');
    expect(() => pos.play({ type: 'play', vertex: at('A9') }, WHITE)).toThrow(IllegalMoveError);
  });

  it('allows filling your own eye — it is bad, not illegal', () => {
    // The distinction matters for teaching: the coach warns about this move,
    // the rules do not forbid it.
    const pos = Position.empty(9, BLACK).withSetup([
      { vertex: at('B9'), color: BLACK },
      { vertex: at('A8'), color: BLACK },
      { vertex: at('B8'), color: BLACK },
    ]);
    expect(pos.isEyeLike(at('A9'), BLACK)).toBe(true);
    expect(pos.isLegal({ type: 'play', vertex: at('A9') }, BLACK)).toBe(true);
  });
});

describe('ko', () => {
  /**
   * The canonical ko shape:
   *      A  B  C  D
   *  6   .  X  O  .
   *  5   X  O  .  O
   *  4   .  X  O  .
   * Black takes at C5, and White must not take straight back at B5.
   */
  const koShape = () =>
    Position.empty(9, BLACK).withSetup([
      { vertex: at('B6'), color: BLACK },
      { vertex: at('A5'), color: BLACK },
      { vertex: at('B4'), color: BLACK },
      { vertex: at('C6'), color: WHITE },
      { vertex: at('B5'), color: WHITE },
      { vertex: at('D5'), color: WHITE },
      { vertex: at('C4'), color: WHITE },
    ]);

  it('sets a ko point when a lone stone takes exactly one stone', () => {
    const after = koShape().play({ type: 'play', vertex: at('C5') }, BLACK);
    expect(after.captured).toEqual([at('B5')]);
    expect(after.position.koPoint).toBe(at('B5'));
  });

  it('bans immediate recapture', () => {
    const after = koShape().play({ type: 'play', vertex: at('C5') }, BLACK);
    expect(after.position.illegalReason({ type: 'play', vertex: at('B5') }, WHITE)).toBe('ko');
  });

  it('lifts the ban once a ko threat has been answered', () => {
    const taken = koShape().play({ type: 'play', vertex: at('C5') }, BLACK);
    const threat = taken.position.play({ type: 'play', vertex: at('G3') }, WHITE);
    const answer = threat.position.play({ type: 'play', vertex: at('G7') }, BLACK);
    expect(answer.position.koPoint).toBeNull();
    expect(answer.position.isLegal({ type: 'play', vertex: at('B5') }, WHITE)).toBe(true);
  });
});

describe('superko', () => {
  /**
   * Positional superko catches repetitions that the simple ko rule misses.
   * A 2x2 board is the smallest place a full cycle fits: after seven moves the
   * whole-board position returns to what it was after move one.
   *
   *   a b     Black a, White b, Black c, White d (takes a+c),
   *   c d     Black a, White c (takes a), Black a (takes b+c+d) -> repeat.
   */
  const cycle = [0, 1, 2, 3, 0, 2];

  it('rejects a move that recreates an earlier whole-board position', () => {
    const game = new Game({ size: 2, rules: { superko: true } });
    for (const v of cycle) game.play({ type: 'play', vertex: v });
    expect(game.illegalReason({ type: 'play', vertex: 0 })).toBe('superko');
    expect(() => game.play({ type: 'play', vertex: 0 })).toThrow(IllegalMoveError);
  });

  it('permits the same repetition when superko is switched off', () => {
    const game = new Game({ size: 2, rules: { superko: false } });
    for (const v of cycle) game.play({ type: 'play', vertex: v });
    expect(game.isLegal({ type: 'play', vertex: 0 })).toBe(true);
  });
});

describe('eyes', () => {
  it('recognises a true eye in the corner only when diagonals are held', () => {
    const pos = Position.empty(9, BLACK).withSetup([
      { vertex: at('B9'), color: BLACK },
      { vertex: at('A8'), color: BLACK },
      { vertex: at('B8'), color: BLACK },
    ]);
    expect(pos.isEyeLike(at('A9'), BLACK)).toBe(true);
    expect(pos.isTrueEye(at('A9'), BLACK)).toBe(true);

    const contested = pos.withSetup([{ vertex: at('B8'), color: WHITE }]);
    expect(contested.isTrueEye(at('A9'), BLACK)).toBe(false);
  });
});

describe('scoring', () => {
  it('gives an empty board to nobody but komi to White', () => {
    const pos = Position.empty(9);
    const breakdown = score(pos, { ...DEFAULT_RULES, komi: 5.5 });
    expect(breakdown.black).toBe(0);
    expect(breakdown.white).toBe(5.5);
    expect(breakdown.winner).toBe(WHITE);
  });

  it('counts surrounded empty points as territory and leaves shared regions neutral', () => {
    // Black walls off the top-left 2x2 corner; a lone white stone sits in the
    // open centre, so the rest of the board is bordered by both colours.
    const pos = Position.empty(9).withSetup([
      { vertex: at('C9'), color: BLACK },
      { vertex: at('C8'), color: BLACK },
      { vertex: at('C7'), color: BLACK },
      { vertex: at('B7'), color: BLACK },
      { vertex: at('A7'), color: BLACK },
      { vertex: at('E5'), color: WHITE },
    ]);
    const owner = ownership(pos);
    expect(owner[at('A9')]).toBe(BLACK);
    expect(owner[at('B8')]).toBe(BLACK);
    expect(owner[at('E4')]).toBe(0); // open centre belongs to nobody yet

    const breakdown = score(pos, { ...DEFAULT_RULES, komi: 0 });
    expect(breakdown.blackTerritory).toBe(4);
    expect(breakdown.whiteTerritory).toBe(0);
    expect(breakdown.black).toBe(9); // 5 stones + 4 points
    expect(breakdown.white).toBe(1); // 1 stone, no territory, no komi
  });

  it('ends the game and scores it after two passes', () => {
    const game = new Game({ size: 9, rules: { komi: 5.5 } });
    game.play({ type: 'play', vertex: at('E5') });
    game.pass();
    game.pass();
    expect(game.isOver).toBe(true);
    expect(game.result?.reason).toBe('passes');
    expect(game.result?.text).toMatch(/^[BW]\+/);
  });

  it('records a resignation without scoring', () => {
    const game = new Game({ size: 9 });
    game.play({ type: 'play', vertex: at('E5') });
    game.resign();
    expect(game.result).toEqual({ winner: BLACK, reason: 'resign', text: 'B+R' });
  });
});

describe('handicap', () => {
  it('places stones on the star points and gives White the first move', () => {
    const game = new Game({ size: 9, handicap: 4 });
    expect(game.toPlay).toBe(WHITE);
    const stones = handicapPoints(9, 4);
    expect(stones).toHaveLength(4);
    for (const v of stones) expect(game.position.at(v)).toBe(BLACK);
  });

  it('uses tengen for odd handicaps above four', () => {
    expect(handicapPoints(19, 5)).toContain(9 * 19 + 9);
    expect(handicapPoints(19, 6)).not.toContain(9 * 19 + 9);
    expect(handicapPoints(19, 9)).toHaveLength(9);
  });
});

describe('undo', () => {
  it('restores the previous position and frees the superko entry', () => {
    const game = new Game({ size: 9 });
    game.play({ type: 'play', vertex: at('D4') });
    game.play({ type: 'play', vertex: at('F6') });
    expect(game.moveCount).toBe(2);
    game.undo();
    expect(game.moveCount).toBe(1);
    expect(game.position.at(at('F6'))).toBe(0);
    expect(game.isLegal({ type: 'play', vertex: at('F6') })).toBe(true);
  });
});

describe('sgf', () => {
  it('round-trips a game through SGF', () => {
    const game = playOut(['D4', 'F6', 'C6', 'F4', 'pass']);
    const sgf = toSgf(game, { playerBlack: 'Learner', playerWhite: 'Pebble' });
    expect(sgf).toContain('SZ[9]');
    expect(sgf).toContain('PB[Learner]');

    const reloaded = fromSgf(sgf);
    expect(reloaded.size).toBe(9);
    expect(reloaded.moveCount).toBe(game.moveCount);
    expect(reloaded.position.toString()).toBe(game.position.toString());
  });
});
