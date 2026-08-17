/// <reference lib="webworker" />
import { Game, type Move } from '@baduk/engine';
import { createBot } from '@baduk/bots';
import type { BotRequest, BotResponse } from './protocol.js';

/**
 * Bots think here, off the main thread.
 *
 * MCTS spends a full second of solid CPU per move; on the main thread that is a
 * frozen board, a stuck hover, and a page that feels broken. The worker keeps
 * the UI alive while Tenuki simulates thousands of games.
 *
 * The request carries the move list rather than a serialised position, so the
 * worker rebuilds the game itself and there is only one source of truth for how
 * a game is constructed.
 */
self.onmessage = (event: MessageEvent<BotRequest>) => {
  const request = event.data;
  try {
    const game = new Game({
      size: request.size,
      rules: { komi: request.komi },
      handicap: request.handicap,
    });
    for (const move of request.moves as Move[]) game.play(move);

    const bot = createBot(request.botId, {
      thinkMs: request.thinkMs,
      ...(request.seed === undefined ? {} : { seed: request.seed }),
    });
    const choice = bot.selectMove(game, game.toPlay);

    Promise.resolve(choice).then((resolved) => {
      const response: BotResponse = {
        id: request.id,
        ok: true,
        move: resolved.move,
        rationale: resolved.rationale,
        considered: resolved.considered?.map((c) => ({ vertex: c.vertex, reason: c.reason })) ?? [],
      };
      self.postMessage(response);
    });
  } catch (error) {
    const response: BotResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
