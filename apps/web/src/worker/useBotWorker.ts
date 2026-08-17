import { useCallback, useEffect, useRef } from 'react';
import type { Game } from '@baduk/engine';
import type { BotRequest, BotResponse } from './protocol.js';

/**
 * Talks to the bot worker with a promise-per-request, keyed by an incrementing
 * id so overlapping requests (undo mid-think, a fast restart) resolve to the
 * right caller instead of leaking into each other.
 */
export function useBotWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (response: BotResponse) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const resolve = pending.current.get(event.data.id);
      if (resolve) {
        pending.current.delete(event.data.id);
        resolve(event.data);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.current.clear();
    };
  }, []);

  return useCallback(
    (game: Game, botId: string, thinkMs: number): Promise<BotResponse> => {
      const worker = workerRef.current;
      const id = nextId.current++;
      if (!worker) {
        return Promise.resolve({ id, ok: false, error: 'The bot worker is not running.' });
      }

      const request: BotRequest = {
        id,
        botId,
        size: game.size,
        komi: game.rules.komi,
        handicap: game.handicap,
        moves: game.history.map((record) => record.move),
        thinkMs,
      };

      return new Promise<BotResponse>((resolve) => {
        pending.current.set(id, resolve);
        worker.postMessage(request);
      });
    },
    [],
  );
}
