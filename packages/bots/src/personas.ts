import type { Persona } from './types.js';

/**
 * Opponents are characters, not difficulty numbers. A learner who is "playing
 * Sprout" is in a relationship with a personality; a learner on "level 2" is
 * grinding. Each persona states plainly what it teaches and where it is weak,
 * so choosing an opponent is itself a lesson in what to work on next.
 */
export const PERSONAS: Record<string, Persona> = {
  pebble: {
    id: 'pebble',
    name: 'Pebble',
    avatar: '🪨',
    rank: '~30 kyu',
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
    rank: '~20 kyu',
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
    rank: '~12 kyu',
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
    rank: '~8 kyu',
    tagline: 'Thinks ahead by playing thousands of games in its head.',
    teaches: 'Whole-board judgement and when a fight is not worth answering.',
    weakness: 'Can misjudge long life-and-death sequences, and slows down on 19x19.',
    accent: '#9b6dd6',
    difficulty: 3,
  },
};

export const PERSONA_ORDER = ['pebble', 'sprout', 'kaze', 'tenuki'] as const;
export type PersonaId = (typeof PERSONA_ORDER)[number];
