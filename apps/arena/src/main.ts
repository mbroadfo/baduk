#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BLACK, Game, WHITE, colorName, formatVertex, toSgf, type Color } from '@baduk/engine';
import { createBot, listPersonas, type Bot } from '@baduk/bots';
import { reviewGame } from '@baduk/coach';

/**
 * The arena: bots playing bots, for tuning personas and sanity-checking the
 * engine over thousands of moves rather than a handful of unit tests.
 *
 * It is also the honest way to answer "is Kaze actually stronger than Sprout?"
 * — the persona ranks in the UI are claims, and this is what checks them.
 */

interface Options {
  black: string;
  white: string;
  games: number;
  size: number;
  thinkMs: number;
  watch: boolean;
  saveDir: string | null;
  maxMoves: number;
  seed: number;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    black: 'sprout',
    white: 'pebble',
    games: 1,
    size: 9,
    thinkMs: 500,
    watch: false,
    saveDir: null,
    maxMoves: 0,
    seed: 1,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case '--black':
      case '-b':
        options.black = value;
        i++;
        break;
      case '--white':
      case '-w':
        options.white = value;
        i++;
        break;
      case '--games':
      case '-n':
        options.games = Number(value);
        i++;
        break;
      case '--size':
      case '-s':
        options.size = Number(value);
        i++;
        break;
      case '--think':
        options.thinkMs = Number(value);
        i++;
        break;
      case '--seed':
        options.seed = Number(value);
        i++;
        break;
      case '--save':
        options.saveDir = value ?? 'arena-results';
        i++;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  options.maxMoves = options.size * options.size * 3;
  return options;
}

function printHelp(): void {
  const names = listPersonas()
    .map((p) => `${p.id} (${p.rank})`)
    .join(', ');
  console.log(`
baduk arena — run bot-vs-bot games

  npm run arena -- [options]

Options
  -b, --black <bot>    Bot playing Black       (default: sprout)
  -w, --white <bot>    Bot playing White       (default: pebble)
  -n, --games <n>      Number of games         (default: 1)
  -s, --size <n>       Board size: 9, 13, 19   (default: 9)
      --think <ms>     Search budget per move  (default: 500)
      --seed <n>       Base RNG seed           (default: 1)
      --save <dir>     Write SGF files to dir
      --watch          Print the board after every move
  -h, --help           Show this message

Bots: ${names}

Examples
  npm run arena -- --black kaze --white sprout --games 20
  npm run arena -- --black tenuki --white kaze --think 2000 --watch
`);
}

async function playGame(
  black: Bot,
  white: Bot,
  size: number,
  maxMoves: number,
  watch: boolean,
): Promise<Game> {
  const game = new Game({ size });

  while (!game.isOver && game.moveCount < maxMoves) {
    const color: Color = game.toPlay;
    const bot = color === BLACK ? black : white;
    const choice = await bot.selectMove(game, color);

    try {
      game.play(choice.move);
    } catch {
      // A bot that offers an illegal move forfeits rather than crashing the run.
      game.forfeit(color, 'illegal move');
      break;
    }

    if (watch) {
      const label =
        choice.move.type === 'play' ? formatVertex(size, choice.move.vertex) : choice.move.type;
      console.log(`\n${game.moveCount}. ${colorName(color)} ${label}`);
      console.log(game.position.toString());
      console.log(`   ${choice.rationale}`);
    }
  }

  // A game that hits the move ceiling is scored where it stands rather than
  // reported as a win for nobody.
  if (!game.isOver) {
    game.pass();
    if (!game.isOver) game.pass();
  }
  return game;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const tally = { black: 0, white: 0, draw: 0 };
  const margins: number[] = [];

  console.log(
    `\n${options.black} (Black) vs ${options.white} (White) — ${options.games} game${options.games === 1 ? '' : 's'} on ${options.size}x${options.size}\n`,
  );

  for (let i = 0; i < options.games; i++) {
    const seed = options.seed + i * 1000;
    const black = createBot(options.black, { seed, thinkMs: options.thinkMs });
    const white = createBot(options.white, { seed: seed + 7, thinkMs: options.thinkMs });

    const started = Date.now();
    const game = await playGame(black, white, options.size, options.maxMoves, options.watch);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const result = game.result;
    if (result?.winner === BLACK) tally.black++;
    else if (result?.winner === WHITE) tally.white++;
    else tally.draw++;
    if (result?.score) margins.push(Math.abs(result.score.margin));

    const review = reviewGame(game, { keyMoments: 1 });
    console.log(
      `Game ${String(i + 1).padStart(3)}  ${(result?.text ?? '?').padEnd(10)} ${String(game.moveCount).padStart(4)} moves  ${elapsed.padStart(6)}s  accuracy B ${review.accuracy.black}% / W ${review.accuracy.white}%`,
    );

    if (options.saveDir) {
      await mkdir(options.saveDir, { recursive: true });
      const sgf = toSgf(game, {
        playerBlack: options.black,
        playerWhite: options.white,
        event: 'Baduk arena',
      });
      await writeFile(join(options.saveDir, `game-${String(i + 1).padStart(3, '0')}.sgf`), sgf, 'utf8');
    }
  }

  const played = options.games;
  const averageMargin =
    margins.length > 0 ? (margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(1) : 'n/a';

  console.log(`
Results after ${played} game${played === 1 ? '' : 's'}
  ${options.black.padEnd(10)} (Black)  ${tally.black}  (${((tally.black / played) * 100).toFixed(0)}%)
  ${options.white.padEnd(10)} (White)  ${tally.white}  (${((tally.white / played) * 100).toFixed(0)}%)
  ${'draws'.padEnd(10)}          ${tally.draw}
  average margin            ${averageMargin} points
`);

  if (options.saveDir) console.log(`SGF files written to ${options.saveDir}/\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
