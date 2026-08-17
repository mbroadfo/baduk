import {
  capturingMoves,
  formatVertex,
  opponent,
  score,
  BLACK,
  type Color,
  type Game,
  type Position,
  type Vertex,
} from '@baduk/engine';
import { evaluateMoves } from './evaluate.js';
import { PERSONAS } from './personas.js';
import { makeRandom, type Bot, type BotMove, type CandidateMove } from './types.js';

/**
 * Tenuki — Monte Carlo tree search with UCT.
 *
 * The idea in one sentence, which is also how the coach explains it to
 * learners: play the rest of the game out at random thousands of times, and
 * prefer the move that wins most often. No Go knowledge is required for that to
 * work, which is exactly why it is worth showing a beginner.
 *
 * Search is budgeted by wall-clock time so the UI stays responsive, and the
 * whole thing is designed to run inside a Web Worker.
 */

interface Node {
  readonly vertex: Vertex | null; // null = the pass edge
  readonly color: Color; // who moved to reach this node
  visits: number;
  wins: number; // from the perspective of `color`
  children: Node[];
  untried: Vertex[];
  readonly parent: Node | null;
}

export interface MctsOptions {
  /** Wall-clock budget per move. */
  readonly thinkMs?: number;
  /** Hard cap on playouts, mostly so tests are deterministic. */
  readonly maxPlayouts?: number;
  /** Exploration constant. Higher searches wider, lower searches deeper. */
  readonly exploration?: number;
  readonly seed?: number;
  /** Resign when the win rate falls below this. Set to 0 to never resign. */
  readonly resignThreshold?: number;
}

export class MctsBot implements Bot {
  readonly persona = PERSONAS.tenuki;
  private readonly rand: () => number;

  constructor(private readonly options: MctsOptions = {}) {
    this.rand = makeRandom(options.seed ?? Date.now());
  }

  selectMove(game: Game, color: Color): BotMove {
    const thinkMs = this.options.thinkMs ?? 1200;
    const maxPlayouts = this.options.maxPlayouts ?? Number.POSITIVE_INFINITY;
    const exploration = this.options.exploration ?? 1.4;
    const resignThreshold = this.options.resignThreshold ?? 0.08;

    const legal = game.legalMoves(color).filter((v) => !game.position.isTrueEye(v, color));
    if (legal.length === 0) {
      return { move: { type: 'pass' }, rationale: 'Tenuki has no move that helps, so it passes.' };
    }

    // Order the root's candidates by the readable evaluator, so the early
    // playouts are spent on moves that are at least plausible.
    const priors = evaluateMoves(game, color).filter((c) => legal.includes(c.vertex));
    const root: Node = {
      vertex: null,
      color: opponent(color),
      visits: 0,
      wins: 0,
      children: [],
      untried: priors.map((c) => c.vertex),
      parent: null,
    };

    const deadline = Date.now() + thinkMs;
    let playouts = 0;
    while (playouts < maxPlayouts && Date.now() < deadline) {
      // Check the clock every 32 playouts rather than every one.
      for (let i = 0; i < 32 && playouts < maxPlayouts; i++) {
        this.runPlayout(root, game.position, color, exploration, game.rules.komi);
        playouts++;
      }
    }

    if (root.children.length === 0) {
      return { move: { type: 'pass' }, rationale: 'Tenuki found nothing to search and passes.' };
    }

    const best = root.children.reduce((a, b) => (a.visits >= b.visits ? a : b));
    const winRate = best.visits > 0 ? best.wins / best.visits : 0;

    if (resignThreshold > 0 && winRate < resignThreshold && game.moveCount > game.size * 2) {
      return {
        move: { type: 'resign' },
        rationale: `After ${playouts.toLocaleString()} simulations Tenuki wins only ${(winRate * 100).toFixed(0)}% of them, and resigns rather than play it out.`,
      };
    }

    const considered: CandidateMove[] = root.children
      .slice()
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5)
      .map((child) => ({
        vertex: child.vertex ?? -1,
        score: child.visits > 0 ? child.wins / child.visits : 0,
        reason:
          child.vertex === null
            ? 'Passing.'
            : `${formatVertex(game.size, child.vertex)} — won ${((child.wins / Math.max(1, child.visits)) * 100).toFixed(0)}% of ${child.visits.toLocaleString()} simulated games.`,
      }));

    if (best.vertex === null) {
      return { move: { type: 'pass' }, rationale: 'Simulations say passing is as good as anything.', considered };
    }

    return {
      move: { type: 'play', vertex: best.vertex },
      rationale: `${formatVertex(game.size, best.vertex)} — Tenuki played out ${playouts.toLocaleString()} random games from here and won ${(winRate * 100).toFixed(0)}% of the ones starting with this move.`,
      considered,
    };
  }

  /** One selection → expansion → simulation → backpropagation cycle. */
  private runPlayout(
    root: Node,
    rootPosition: Position,
    rootColor: Color,
    exploration: number,
    komi: number,
  ): void {
    let node = root;
    let position = rootPosition;
    let toPlay = rootColor;
    const path: Node[] = [root];

    // --- Selection: descend through fully expanded nodes by UCT.
    while (node.untried.length === 0 && node.children.length > 0) {
      node = bestChild(node, exploration);
      if (node.vertex !== null) {
        const played = position.tryPlay({ type: 'play', vertex: node.vertex }, toPlay);
        if (!played) break;
        position = played.position;
      } else {
        position = position.play({ type: 'pass' }, toPlay).position;
      }
      toPlay = opponent(toPlay);
      path.push(node);
    }

    // --- Expansion: try one untested move.
    if (node.untried.length > 0) {
      const index = Math.floor(this.rand() * node.untried.length);
      const vertex = node.untried.splice(index, 1)[0];
      const played = position.tryPlay({ type: 'play', vertex }, toPlay);
      if (played) {
        position = played.position;
        const child: Node = {
          vertex,
          color: toPlay,
          visits: 0,
          wins: 0,
          children: [],
          untried: position
            .legalMoves(opponent(toPlay))
            .filter((v) => !position.isTrueEye(v, opponent(toPlay))),
          parent: node,
        };
        node.children.push(child);
        node = child;
        path.push(child);
        toPlay = opponent(toPlay);
      }
    }

    // --- Simulation: random play to the end, then area-score it.
    const blackLeads = this.simulate(position, toPlay, komi);

    // --- Backpropagation: credit each node from its own mover's perspective.
    for (const visited of path) {
      visited.visits++;
      const movedBlack = visited.color === BLACK;
      if (movedBlack === blackLeads) visited.wins++;
    }
  }

  /**
   * A light random playout. The only knowledge it carries is "take a capture if
   * one is offered, never fill your own eye" — enough to stop games from
   * degenerating, cheap enough to run thousands of times.
   */
  private simulate(start: Position, toPlay: Color, komi: number): boolean {
    let position = start;
    let color = toPlay;
    let passes = 0;
    const limit = position.area * 2;

    for (let move = 0; move < limit && passes < 2; move++) {
      const captures = capturingMoves(position, color);
      let chosen: Vertex | null = null;

      if (captures.length > 0 && this.rand() < 0.85) {
        chosen = captures[0].vertex;
      } else {
        const options = position
          .legalMoves(color)
          .filter((v) => !position.isEyeLike(v, color));
        chosen = options.length > 0 ? options[Math.floor(this.rand() * options.length)] : null;
      }

      if (chosen === null) {
        position = position.play({ type: 'pass' }, color).position;
        passes++;
      } else {
        const played = position.tryPlay({ type: 'play', vertex: chosen }, color);
        if (!played) {
          position = position.play({ type: 'pass' }, color).position;
          passes++;
        } else {
          position = played.position;
          passes = 0;
        }
      }
      color = opponent(color);
    }

    const result = score(position, { komi, superko: false, scoring: 'area', allowSuicide: false });
    return result.margin > 0;
  }
}

function bestChild(node: Node, exploration: number): Node {
  let best = node.children[0];
  let bestValue = Number.NEGATIVE_INFINITY;
  const logVisits = Math.log(Math.max(1, node.visits));

  for (const child of node.children) {
    if (child.visits === 0) return child;
    const exploit = child.wins / child.visits;
    const explore = exploration * Math.sqrt(logVisits / child.visits);
    const value = exploit + explore;
    if (value > bestValue) {
      bestValue = value;
      best = child;
    }
  }
  return best;
}

export function createTenuki(options: MctsOptions = {}): MctsBot {
  return new MctsBot(options);
}
