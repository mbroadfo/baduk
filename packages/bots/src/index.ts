import { RandomBot, HeuristicBot, createSprout, createKaze } from './simple.js';
import { MctsBot, createTenuki, type MctsOptions } from './mcts.js';
import { PERSONAS, PERSONA_ORDER, type PersonaId } from './personas.js';
import type { Bot } from './types.js';

export * from './types.js';
export * from './personas.js';
export * from './evaluate.js';
export { RandomBot, HeuristicBot, createSprout, createKaze };
export { MctsBot, createTenuki, type MctsOptions };

export interface BotFactoryOptions {
  readonly seed?: number;
  /** Only meaningful for search-based bots. */
  readonly thinkMs?: number;
}

/**
 * Builds a bot from its persona id. The web app, the arena CLI and the coach's
 * "what would a stronger player do?" feature all go through here, so there is
 * exactly one place that knows how each persona is configured.
 */
export function createBot(id: PersonaId | string, options: BotFactoryOptions = {}): Bot {
  switch (id) {
    case 'pebble':
      return new RandomBot(options.seed);
    case 'sprout':
      return createSprout(options.seed);
    case 'kaze':
      return createKaze(options.seed);
    case 'tenuki':
      return createTenuki({
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        thinkMs: options.thinkMs ?? 1200,
      });
    default:
      throw new Error(`Unknown bot: ${id}. Known bots: ${PERSONA_ORDER.join(', ')}`);
  }
}

export function listPersonas() {
  return PERSONA_ORDER.map((id) => PERSONAS[id]);
}
