import {
  capturingMoves,
  estimateLead,
  formatVertex,
  groupsInAtari,
  ladderEscapes,
  opponent,
  type Color,
  type Game,
  type Vertex,
} from '@baduk/engine';
import type { ConceptId } from './concepts.js';

/**
 * Live observations about the position in front of the player.
 *
 * These are the things a teacher sitting beside you would point at. They are
 * facts, never opinions about the best move — that is `advise`. Keeping them
 * separate matters: a learner can be warned that their group is in atari
 * without being told what to do about it, which is where the learning happens.
 */

export type ObservationKind = 'danger' | 'opportunity' | 'caution' | 'info';

export interface Observation {
  readonly kind: ObservationKind;
  readonly headline: string;
  readonly detail: string;
  /** Points to highlight on the board. */
  readonly highlight: readonly Vertex[];
  readonly concept?: ConceptId;
  /** Higher shows first. */
  readonly urgency: number;
}

export interface ObserveOptions {
  /** Suppress gentler notes once a player no longer needs them. */
  readonly stage?: 1 | 2 | 3;
}

/** What is true about the position right now, from `color`'s point of view. */
export function observe(game: Game, color: Color, options: ObserveOptions = {}): Observation[] {
  const stage = options.stage ?? 1;
  const notes: Observation[] = [];
  const position = game.position;
  const foe = opponent(color);
  const size = game.size;

  // --- Your groups that are about to die ---------------------------------
  for (const group of groupsInAtari(position, color)) {
    const point = group.liberties[0];
    const escapes = ladderEscapes(position, group);
    notes.push({
      kind: 'danger',
      headline: `Your ${describeGroup(group.stones.length)} at ${formatVertex(size, group.stones[0])} is in atari`,
      detail: escapes
        ? `One more move at ${formatVertex(size, point)} and ${group.stones.length === 1 ? 'it is' : 'they are'} captured. You can still run — the escape looks like it works.`
        : `One more move at ${formatVertex(size, point)} and ${group.stones.length === 1 ? 'it is' : 'they are'} captured. Running does not work here: it is a ladder, and you would only lose more stones. Consider playing elsewhere and treating these as lost.`,
      highlight: [...group.stones, point],
      concept: escapes ? 'atari' : 'ladder',
      urgency: 100 + group.stones.length,
    });
  }

  // --- Free stones on offer ----------------------------------------------
  for (const capture of capturingMoves(position, color)) {
    notes.push({
      kind: 'opportunity',
      headline: `You can capture ${capture.stones} stone${capture.stones === 1 ? '' : 's'}`,
      detail: `Playing ${formatVertex(size, capture.vertex)} takes ${capture.stones === 1 ? 'it' : 'them'} off the board. Captured stones count against your opponent at the end.`,
      highlight: [capture.vertex],
      concept: 'capture',
      urgency: 80 + capture.stones,
    });
  }

  // --- Groups getting short of breath ------------------------------------
  if (stage <= 2) {
    const seen = new Set<Vertex>();
    for (let v = 0; v < position.area; v++) {
      if (position.at(v) !== color || seen.has(v)) continue;
      const group = position.group(v);
      if (!group) continue;
      for (const s of group.stones) seen.add(s);
      if (group.liberties.length === 2 && group.stones.length >= 2) {
        notes.push({
          kind: 'caution',
          headline: `A group of ${group.stones.length} is down to two liberties`,
          detail: `Two liberties means two moves from capture — close enough that your opponent can start a fight here. Adding a stone now is often worth more than it looks.`,
          highlight: group.stones,
          concept: 'liberties',
          urgency: 40,
        });
      }
    }
  }

  // --- What the opponent is threatening ------------------------------------
  const theirCaptures = capturingMoves(position, foe);
  if (theirCaptures.length > 0) {
    const biggest = theirCaptures[0];
    notes.push({
      kind: 'danger',
      headline: `Your opponent can capture ${biggest.stones} stone${biggest.stones === 1 ? '' : 's'}`,
      detail: `If you play elsewhere, ${formatVertex(size, biggest.vertex)} takes ${biggest.stones === 1 ? 'a stone' : `${biggest.stones} stones`}. Is what you want to play worth more than that?`,
      highlight: [biggest.vertex],
      concept: 'atari',
      urgency: 90,
    });
  }

  // --- Where the game stands ------------------------------------------------
  if (game.moveCount > size) {
    // estimateLead is signed for Black; flip it to the learner's perspective.
    const lead = estimateLead(position, game.rules.komi);
    const mine = color === 1 ? lead : -lead;
    notes.push({
      kind: 'info',
      headline:
        Math.abs(mine) < 3
          ? 'The game is close'
          : `${mine > 0 ? 'You are ahead' : 'You are behind'} by roughly ${Math.abs(mine).toFixed(0)} points`,
      detail:
        Math.abs(mine) < 3
          ? 'Neither side has a clear lead. This is a rough estimate from influence, not a real count.'
          : mine > 0
            ? 'When you are ahead, simplify: trade stones, settle your groups, and avoid unnecessary fights.'
            : 'When you are behind, complicate: start a fight where you have more stones nearby, and avoid straightforward trades.',
      highlight: [],
      concept: 'counting',
      urgency: 10,
    });
  }

  return notes.sort((a, b) => b.urgency - a.urgency);
}

function describeGroup(size: number): string {
  return size === 1 ? 'stone' : `group of ${size}`;
}
