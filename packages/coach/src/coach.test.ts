import { describe, expect, it } from 'vitest';
import { Game, parseVertex, BLACK, WHITE, type Vertex } from '@baduk/engine';
import { observe } from './observe.js';
import { advise } from './advise.js';
import { reviewGame } from './review.js';
import { CONCEPTS, CURRICULUM } from './concepts.js';

const at = (label: string, size = 9): Vertex => {
  const v = parseVertex(size, label);
  if (v === null) throw new Error(`bad label ${label}`);
  return v;
};

function gameWithAtari(): Game {
  const game = new Game({ size: 9 });
  // Black D4 ends up with a single liberty at D3.
  for (const move of ['D4', 'D5', 'G7', 'C4', 'G3', 'E4'] as const) {
    game.play({ type: 'play', vertex: at(move) });
  }
  return game;
}

describe('curriculum', () => {
  it('defines every concept it lists, with teaching text', () => {
    for (const id of CURRICULUM) {
      const concept = CONCEPTS[id];
      expect(concept, `missing concept ${id}`).toBeDefined();
      expect(concept.summary.length).toBeGreaterThan(20);
      expect(concept.whyItMatters.length).toBeGreaterThan(20);
      expect(concept.tryThis.length).toBeGreaterThan(20);
    }
  });

  it('never lists a concept before its prerequisites', () => {
    const seen = new Set<string>();
    for (const id of CURRICULUM) {
      for (const prerequisite of CONCEPTS[id].prerequisites ?? []) {
        expect(seen.has(prerequisite), `${id} comes before ${prerequisite}`).toBe(true);
      }
      seen.add(id);
    }
  });
});

describe('observe', () => {
  it('warns the player when their own group is in atari', () => {
    const game = gameWithAtari();
    const notes = observe(game, BLACK);
    const danger = notes.find((n) => n.kind === 'danger' && /in atari/.test(n.headline));

    expect(danger).toBeDefined();
    expect(danger!.highlight).toContain(at('D4'));
    expect(danger!.concept).toBeDefined();
  });

  it('puts the most urgent observation first', () => {
    const game = gameWithAtari();
    const notes = observe(game, BLACK);
    expect(notes[0].urgency).toBeGreaterThanOrEqual(notes[notes.length - 1].urgency);
  });

  it('spots a capture that is available', () => {
    const game = new Game({ size: 9 });
    for (const move of ['B9', 'A9', 'D4', 'F6'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    const notes = observe(game, BLACK);
    const chance = notes.find((n) => n.kind === 'opportunity');
    expect(chance?.highlight).toContain(at('A8'));
  });

  it('says nothing alarming about a quiet opening position', () => {
    const game = new Game({ size: 9 });
    game.play({ type: 'play', vertex: at('D4') });
    const notes = observe(game, WHITE);
    expect(notes.filter((n) => n.kind === 'danger')).toHaveLength(0);
  });
});

describe('advise', () => {
  it('withholds the move at the nudge level and reveals it at the move level', () => {
    const game = gameWithAtari();

    const nudge = advise(game, BLACK, { level: 'nudge' });
    expect(nudge.vertex).toBeUndefined();
    expect(nudge.headline).toMatch(/danger/i);

    const area = advise(game, BLACK, { level: 'area' });
    expect(area.vertex).toBeUndefined();
    expect(area.region?.length ?? 0).toBeGreaterThan(0);

    const move = advise(game, BLACK, { level: 'move' });
    expect(move.vertex).toBe(at('D3'));
    expect(move.detail).toMatch(/atari|liberties/);
  });

  it('offers alternatives at every level', () => {
    const game = gameWithAtari();
    for (const level of ['nudge', 'area', 'move'] as const) {
      expect(advise(game, BLACK, { level }).alternatives.length).toBeGreaterThan(0);
    }
  });

  it('talks about corners in the opening', () => {
    const game = new Game({ size: 9 });
    const nudge = advise(game, BLACK, { level: 'nudge' });
    expect(nudge.concept).toBe('corners-first');
  });
});

describe('review', () => {
  it('grades every move and finds the worst one', () => {
    const game = new Game({ size: 9 });
    // Black plays a reasonable opening, then fills its own eye — a real blunder.
    for (const move of ['C7', 'G3', 'G7', 'C3', 'D4'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    const review = reviewGame(game);

    expect(review.moves.length).toBe(game.moveCount);
    expect(review.accuracy.black).toBeGreaterThanOrEqual(0);
    expect(review.accuracy.black).toBeLessThanOrEqual(100);
    expect(review.summary.length).toBeGreaterThan(0);
    for (const move of review.moves) {
      expect(move.rank).toBeGreaterThan(0);
      expect(move.lostValue).toBeGreaterThanOrEqual(0);
      expect(move.comment.length).toBeGreaterThan(0);
    }
  });

  it('can review a single player only', () => {
    const game = new Game({ size: 9 });
    for (const move of ['C7', 'G3', 'G7', 'C3'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    const review = reviewGame(game, { forColor: BLACK });
    expect(review.moves.every((m) => m.color === BLACK)).toBe(true);
    expect(review.moves).toHaveLength(2);
  });

  it('flags a self-atari as a key moment and suggests what to study', () => {
    const game = new Game({ size: 9 });
    // White fences off the corner; Black then plays A9, leaving the new stone
    // with a single liberty at A8 for no reason at all.
    for (const move of ['E5', 'B9', 'F5', 'A7', 'G5', 'B8', 'A9'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    const review = reviewGame(game, { forColor: BLACK });
    const blunder = review.moves.find((m) => m.move.type === 'play' && m.move.vertex === at('A9'));

    expect(blunder).toBeDefined();
    expect(['mistake', 'blunder']).toContain(blunder!.grade);
    expect(blunder!.betterMove).toBeDefined();
    expect(review.studyNext.length).toBeGreaterThan(0);
  });

  it('survives a game that ended in resignation', () => {
    const game = new Game({ size: 9 });
    game.play({ type: 'play', vertex: at('D4') }); // Black
    game.resign(); // White resigns, so Black wins
    const review = reviewGame(game);
    expect(review.summary).toMatch(/B\+R/);
  });
});
