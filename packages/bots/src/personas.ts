import type { Persona } from './types.js';

/**
 * Opponents are characters, not difficulty numbers. A learner who is "playing
 * Sprout" is in a relationship with a personality; a learner grinding "level 2"
 * is not. Each persona states plainly what it teaches and where it is weak, so
 * choosing an opponent is itself a lesson in what to work on next.
 *
 * On `rank`: these are *relative* levels measured by running the personas
 * against each other in the arena, not kyu ratings. Nothing here has been
 * calibrated against human play, so claiming a kyu grade would be inventing a
 * number. Measured head-to-head on 9x9:
 *
 *   Sprout beats Pebble  100% (9-0)
 *   Kaze   beats Sprout   75% (9-3)
 *   Tenuki beats Kaze     62% (5-3)
 *
 * The ordering is real; the gaps above Pebble are narrower than the character
 * descriptions might suggest. Re-run `npm run arena` after touching the
 * evaluator and update these numbers.
 */
export const PERSONAS: Record<string, Persona> = {
  pebble: {
    id: 'pebble',
    name: 'Pebble',
    avatar: '🪨',
    rank: 'Level 1 · plays at random',
    tagline: 'Sits there. Plays stones. Means well.',
    teaches: 'The rules themselves — how stones connect, breathe, and get captured.',
    weakness: 'No plan whatsoever. It will not defend, attack, or notice your territory.',
    accent: '#8d9aa5',
    difficulty: 0,
  },
  sprout: {
    id: 'sprout',
    name: 'Sprout',
    avatar: '🌱',
    rank: 'Level 2 · tactics only',
    tagline: 'Loves capturing things. Learning that there is more to life.',
    teaches: 'Liberties and atari — it will punish every stone you leave on one breath.',
    weakness: 'Greedy and short-sighted. It chases stones and ignores the bigger board.',
    accent: '#4caf7d',
    difficulty: 1,
  },
  kaze: {
    id: 'kaze',
    name: 'Kaze',
    avatar: '🍃',
    rank: 'Level 3 · plays the whole board',
    tagline: 'Plays the whole board, calmly.',
    teaches: 'Direction of play — corners before sides, sides before centre.',
    weakness: 'Reads shallowly. Complicated fights and life-and-death will confuse it.',
    accent: '#4a90d9',
    difficulty: 2,
  },
  tenuki: {
    id: 'tenuki',
    name: 'Tenuki',
    avatar: '🌀',
    rank: 'Level 4 · searches ahead',
    tagline: 'Thinks ahead by playing thousands of games in its head.',
    teaches: 'Whole-board judgement and when a fight is not worth answering.',
    weakness:
      'Long life-and-death sequences, and it slows right down on 19x19. Given only a fraction of a second to think it is no stronger than Kaze — the thinking-time setting is what makes it the toughest opponent here.',
    accent: '#9b6dd6',
    difficulty: 3,
  },
};

export const PERSONA_ORDER = ['pebble', 'sprout', 'kaze', 'tenuki'] as const;
export type PersonaId = (typeof PERSONA_ORDER)[number];
