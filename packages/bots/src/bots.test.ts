import { describe, expect, it } from 'vitest';
import { Game, Position, parseVertex, BLACK, WHITE, type Vertex } from '@baduk/engine';
import { createBot, listPersonas, PERSONA_ORDER, HeuristicBot, PERSONAS } from './index.js';
import { evaluateMoves, explainMove } from './evaluate.js';
import { MctsBot } from './mcts.js';

const at = (label: string, size = 9): Vertex => {
  const v = parseVertex(size, label);
  if (v === null) throw new Error(`bad label ${label}`);
  return v;
};

describe('personas', () => {
  it('exposes every persona with the fields the picker needs', () => {
    const personas = listPersonas();
    expect(personas).toHaveLength(PERSONA_ORDER.length);
    for (const p of personas) {
      expect(p.name).toBeTruthy();
      expect(p.avatar).toBeTruthy();
      expect(p.teaches).toBeTruthy();
      expect(p.weakness).toBeTruthy();
      // Levels are relative and measured in the arena, deliberately not kyu
      // ranks — nothing here is calibrated against human play.
      expect(p.rank).toMatch(/^Level \d/);
      expect(p.rank).not.toMatch(/kyu|dan/);
    }
  });

  it('orders personas by increasing difficulty', () => {
    const difficulties = listPersonas().map((p) => p.difficulty);
    expect(difficulties).toEqual([...difficulties].sort((a, b) => a - b));
  });
});

describe('every bot', () => {
  for (const id of PERSONA_ORDER) {
    it(`${id} returns a legal move and explains it`, async () => {
      const game = new Game({ size: 9 });
      game.play({ type: 'play', vertex: at('D4') });
      const bot = createBot(id, { seed: 42, thinkMs: 60 });
      const choice = await bot.selectMove(game, WHITE);

      expect(choice.rationale.length).toBeGreaterThan(0);
      if (choice.move.type === 'play') {
        expect(game.isLegal(choice.move, WHITE)).toBe(true);
      } else {
        expect(['pass', 'resign']).toContain(choice.move.type);
      }
    });
  }

  it('rejects an unknown persona by name', () => {
    expect(() => createBot('alphago')).toThrow(/Unknown bot/);
  });
});

describe('bot vs bot', () => {
  it('plays a full 9x9 game to a legal finish', async () => {
    const game = new Game({ size: 9 });
    const black = createBot('sprout', { seed: 7 });
    const white = createBot('pebble', { seed: 11 });

    let guard = 0;
    while (!game.isOver && guard++ < 400) {
      const bot = game.toPlay === BLACK ? black : white;
      const choice = await bot.selectMove(game, game.toPlay);
      game.play(choice.move);
    }

    expect(game.isOver).toBe(true);
    expect(game.result?.text).toMatch(/^[BW]\+|^Draw/);
    expect(guard).toBeLessThan(400); // it ended on its own, not on the guard
  }, 30_000);
});

describe('evaluator', () => {
  it('ranks an available capture above a quiet move', () => {
    const game = new Game({ size: 9 });
    // White stone on A9 with a single liberty at A8.
    for (const move of ['B9', 'A9', 'D4', 'F6'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    // Black to play: A8 takes the white stone on A9.
    const ranked = evaluateMoves(game, BLACK, { limit: 1 });
    expect(ranked[0].vertex).toBe(at('A8'));
    expect(ranked[0].reason).toMatch(/[Cc]aptures 1 stone/);
  });

  it('penalises self-atari and says why', () => {
    // Playing A9 leaves the new stone with a single liberty at A8.
    const position = Position.empty(9, BLACK).withSetup([
      { vertex: at('B9'), color: WHITE },
      { vertex: at('A7'), color: WHITE },
      { vertex: at('B8'), color: WHITE },
    ]);
    const context = { position, size: 9, moveCount: 10, lastMove: null };

    const { score, terms } = explainMove(context, at('A9'), BLACK);
    expect(score).toBeLessThan(0);
    expect(terms.some((t) => /[Ss]elf-atari/.test(t.reason))).toBe(true);
  });

  it('warns about filling your own eye', () => {
    const position = Position.empty(9, BLACK).withSetup([
      { vertex: at('B9'), color: BLACK },
      { vertex: at('A8'), color: BLACK },
      { vertex: at('B8'), color: BLACK },
    ]);
    const context = { position, size: 9, moveCount: 10, lastMove: null };

    const { score, terms } = explainMove(context, at('A9'), BLACK);
    expect(terms.some((t) => /own eye/.test(t.reason))).toBe(true);
    expect(score).toBeLessThan(0);
  });
});

describe('mcts', () => {
  it('reports how many simulations backed its choice', async () => {
    const game = new Game({ size: 9 });
    const bot = new MctsBot({ seed: 3, thinkMs: 400, maxPlayouts: 300, resignThreshold: 0 });
    const choice = await bot.selectMove(game, BLACK);

    expect(choice.move.type).toBe('play');
    expect(choice.rationale).toMatch(/random games|simulated/);
    expect(choice.considered?.length ?? 0).toBeGreaterThan(0);
  }, 20_000);

  it('respects its time budget', async () => {
    const game = new Game({ size: 9 });
    const bot = new MctsBot({ seed: 3, thinkMs: 300, resignThreshold: 0 });

    const started = Date.now();
    await bot.selectMove(game, BLACK);
    const elapsed = Date.now() - started;

    // Generous upper bound: the point is that it stops, not that it is precise.
    expect(elapsed).toBeLessThan(3000);
  }, 20_000);
});

describe('tactical reliability', () => {
  it('a deterministic heuristic bot always takes a free capture', async () => {
    const game = new Game({ size: 9 });
    for (const move of ['B9', 'A9', 'D4', 'F6'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    // temperature 0 means "always your top-ranked move" — no sampling.
    const bot = new HeuristicBot(PERSONAS.sprout, { temperature: 0, seed: 1 });
    const choice = await bot.selectMove(game, BLACK);
    expect(choice.move).toEqual({ type: 'play', vertex: at('A8') });
    expect(choice.rationale).toMatch(/[Cc]aptures/);
  });

  it('a deterministic heuristic bot saves its own group from atari', async () => {
    const game = new Game({ size: 9 });
    // Black D4 gets surrounded on three sides; Black must give it more liberties.
    for (const move of ['D4', 'D5', 'G7', 'C4', 'G3', 'E4'] as const) {
      game.play({ type: 'play', vertex: at(move) });
    }
    expect(game.position.libertyCount(at('D4'))).toBe(1);

    const bot = new HeuristicBot(PERSONAS.sprout, { temperature: 0, seed: 1 });
    const choice = await bot.selectMove(game, BLACK);
    expect(choice.move).toEqual({ type: 'play', vertex: at('D3') });
    expect(choice.rationale).toMatch(/atari|liberties/);
  });
});
