import { describe, expect, it } from 'vitest';
import { BLACK, Game, WHITE, type Color } from '@baduk/engine';
import { createBot } from '@baduk/bots';
import { HINT_LEVELS, advise, observe, reviewGame } from './index.js';

/**
 * End-to-end exercise of the teaching layer.
 *
 * The unit tests above use hand-built shapes, which only prove the coach works
 * on positions someone thought to construct. This plays real games and asks for
 * every kind of guidance on every move, so the coach meets hundreds of
 * positions nobody designed — including the strange ones that appear in a
 * scrappy endgame.
 */
describe('a full game with the coach watching', () => {
  it('produces sane guidance on every move of a complete game', async () => {
    const game = new Game({ size: 9 });
    const black = createBot('sprout', { seed: 21 });
    const white = createBot('kaze', { seed: 34 });

    let moves = 0;
    while (!game.isOver && moves < 300) {
      const color: Color = game.toPlay;

      // Everything the UI would ask for, on every single move.
      const notes = observe(game, color);
      for (const note of notes) {
        expect(note.headline.length).toBeGreaterThan(0);
        expect(note.detail.length).toBeGreaterThan(0);
        expect(note.urgency).toBeGreaterThan(0);
        for (const vertex of note.highlight) {
          expect(vertex).toBeGreaterThanOrEqual(0);
          expect(vertex).toBeLessThan(game.position.area);
        }
      }

      for (const level of HINT_LEVELS) {
        const hint = advise(game, color, { level });
        expect(hint.headline.length).toBeGreaterThan(0);
        if (hint.vertex !== undefined) {
          // The coach must never recommend a move it cannot legally play.
          expect(game.isLegal({ type: 'play', vertex: hint.vertex }, color)).toBe(true);
        }
        for (const alternative of hint.alternatives) {
          expect(game.isLegal({ type: 'play', vertex: alternative.vertex }, color)).toBe(true);
        }
      }

      const bot = color === BLACK ? black : white;
      const choice = await bot.selectMove(game, color);
      game.play(choice.move);
      moves++;
    }

    expect(game.isOver).toBe(true);

    const review = reviewGame(game);
    expect(review.moves.length).toBeGreaterThan(10);
    expect(review.summary).toMatch(/[BW]\+|Draw|unfinished/);
    expect(review.keyMoments.length).toBeLessThanOrEqual(3);
    for (const graded of review.moves) {
      expect(graded.lostValue).toBeGreaterThanOrEqual(0);
      expect(graded.comment.length).toBeGreaterThan(0);
      expect([BLACK, WHITE]).toContain(graded.color);
    }
  }, 60_000);

  it('never recommends filling a true eye', async () => {
    // The endgame is where this goes wrong: once territory is settled, a naive
    // evaluator starts suggesting moves inside its own eyes.
    const game = new Game({ size: 9 });
    const black = createBot('kaze', { seed: 5 });
    const white = createBot('sprout', { seed: 9 });

    let moves = 0;
    while (!game.isOver && moves < 300) {
      const color: Color = game.toPlay;
      const hint = advise(game, color, { level: 'move' });
      if (hint.vertex !== undefined) {
        expect(
          game.position.isTrueEye(hint.vertex, color),
          `coach suggested filling its own eye at move ${moves}`,
        ).toBe(false);
      }
      const bot = color === BLACK ? black : white;
      game.play((await bot.selectMove(game, color)).move);
      moves++;
    }
    expect(moves).toBeGreaterThan(10);
  }, 60_000);
});
