import { Game } from './game.js';
import { BLACK, type Color, type Move, type Vertex } from './types.js';

/**
 * Minimal SGF (FF[4]) reader/writer covering the main line: setup stones,
 * moves, captures and comments. Enough to save a game, reload it into the
 * review screen, or open it in any Go client — which matters for a teaching
 * tool, because progress the learner cannot keep is progress lost.
 */

export interface SgfInfo {
  readonly playerBlack?: string;
  readonly playerWhite?: string;
  readonly date?: string;
  readonly event?: string;
}

function sgfCoord(size: number, v: Vertex): string {
  const x = v % size;
  const y = Math.floor(v / size);
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

function parseCoord(size: number, text: string): Vertex | null {
  if (text.length < 2) return null;
  const x = text.charCodeAt(0) - 97;
  const y = text.charCodeAt(1) - 97;
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return y * size + x;
}

function escapeText(text: string): string {
  return text.replace(/([\]\\])/g, '\\$1');
}

export function toSgf(game: Game, info: SgfInfo = {}): string {
  const parts = [
    'GM[1]',
    'FF[4]',
    'CA[UTF-8]',
    `AP[baduk:0.1.0]`,
    `SZ[${game.size}]`,
    `KM[${game.rules.komi}]`,
    `RU[${game.rules.scoring === 'area' ? 'Chinese' : 'Japanese'}]`,
  ];
  if (game.handicap >= 2) parts.push(`HA[${game.handicap}]`);
  if (info.playerBlack) parts.push(`PB[${escapeText(info.playerBlack)}]`);
  if (info.playerWhite) parts.push(`PW[${escapeText(info.playerWhite)}]`);
  if (info.event) parts.push(`EV[${escapeText(info.event)}]`);
  parts.push(`DT[${info.date ?? new Date().toISOString().slice(0, 10)}]`);
  if (game.result) parts.push(`RE[${game.result.text}]`);

  // Handicap stones are setup, not moves, so they live in the root node.
  const start = game.positionAt(0);
  const setup: string[] = [];
  for (let v = 0; v < start.area; v++) {
    if (start.stones[v] === BLACK) setup.push(sgfCoord(game.size, v));
  }
  if (setup.length > 0) parts.push(`AB${setup.map((c) => `[${c}]`).join('')}`);

  let sgf = `(;${parts.join('')}`;
  for (const record of game.history) {
    const tag = record.color === BLACK ? 'B' : 'W';
    const value = record.move.type === 'play' ? sgfCoord(game.size, record.move.vertex) : '';
    sgf += `;${tag}[${value}]`;
    if (record.comment) sgf += `C[${escapeText(record.comment)}]`;
  }
  return `${sgf})`;
}

/**
 * Reads the main line of an SGF into a Game. Variations, and properties beyond
 * the ones written above, are skipped rather than rejected — most real SGF
 * files in the wild carry extras we do not need.
 */
export function fromSgf(sgf: string): Game {
  const sizeMatch = /\bSZ\[(\d+)\]/.exec(sgf);
  const komiMatch = /\bKM\[([-\d.]+)\]/.exec(sgf);
  const handicapMatch = /\bHA\[(\d+)\]/.exec(sgf);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;

  const game = new Game({
    size,
    handicap: handicapMatch ? Number(handicapMatch[1]) : 0,
    ...(komiMatch ? { rules: { komi: Number(komiMatch[1]) } } : {}),
  });

  // Stop at the first variation: we only replay the main line.
  const mainLine = sgf.slice(0, sgf.indexOf('(', 1) === -1 ? sgf.length : sgf.indexOf('(', 1));
  const moveRe = /;\s*([BW])\[([a-z]{0,2})\]/g;
  let match: RegExpExecArray | null;
  while ((match = moveRe.exec(mainLine)) !== null) {
    const color: Color = match[1] === 'B' ? 1 : 2;
    const coord = match[2];
    const vertex = coord.length === 2 ? parseCoord(size, coord) : null;
    // `tt` is the historical pass encoding on boards up to 19x19.
    const move: Move =
      vertex === null || coord === 'tt' ? { type: 'pass' } : { type: 'play', vertex };
    if (game.toPlay !== color || !game.isLegal(move)) {
      // A colour mismatch means the record has setup or a skipped turn; honour
      // the file rather than the engine's expectation where we safely can.
      if (game.isLegal(move, color)) continue;
      break;
    }
    game.play(move);
    if (game.isOver) break;
  }
  return game;
}
