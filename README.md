# Baduk

An interactive playspace for learning **Go** (baduk / weiqi / 囲碁) — play AI opponents with
distinct personalities, get graduated hints from a coach that explains its reasoning, and review
every game to find the two or three moves that actually decided it.

The goal is not another engine that beats humans. That problem is solved, and a superhuman
opponent teaches a beginner almost nothing. The goal is a place where someone who has never
played can sit down, understand what is happening, and enjoy it.

```
npm install
npm run dev          # play at http://localhost:5173
npm test             # 51 tests across engine, bots and coach
npm run arena -- -b kaze -w sprout -n 20   # watch bots play each other
```

## What is here

| Package | What it does |
| --- | --- |
| [`packages/engine`](packages/engine) | The rules. Captures, suicide, ko and positional superko, area/territory scoring, handicap, SGF, and a tactics layer (atari, ladders, influence). No dependencies. |
| [`packages/bots`](packages/bots) | Four opponents, each a character rather than a difficulty level. Every bot must explain the move it chose. |
| [`packages/coach`](packages/coach) | The teaching layer: live observations, three-tier hints, a 15-concept curriculum, and post-game review. |
| [`apps/web`](apps/web) | The React SPA. Static build, no backend, bots run in a Web Worker. |
| [`apps/arena`](apps/arena) | Bot-vs-bot tournament runner for tuning personas and stress-testing the engine. |

## The opponents

Learners bond with characters far more readily than with a difficulty slider, so each opponent has
a name, a face, and an honest statement of what it is bad at.

| | Bot | Level | Teaches you | Blind spot |
| --- | --- | --- | --- | --- |
| 🪨 | **Pebble** | 1 — plays at random | The rules themselves | No plan whatsoever |
| 🌱 | **Sprout** | 2 — tactics only | Liberties and atari | Chases stones, ignores the board |
| 🍃 | **Kaze** | 3 — plays the whole board | Direction of play | Reads shallowly in fights |
| 🌀 | **Tenuki** | 4 — searches ahead | Whole-board judgement | Long life-and-death sequences |

Pebble, Sprout and Kaze share one transparent evaluator; Tenuki is Monte Carlo tree search with
UCT, budgeted by wall-clock time so the interface never stalls.

**These levels are measured, not estimated.** They come from running the personas against each
other in the arena, playing both colours — not from a guess at a kyu grade. On 9×9:

| Pairing | Result |
| --- | --- |
| Sprout vs Pebble | 9–0 (100%) |
| Kaze vs Sprout | 9–3 (75%) |
| Tenuki vs Kaze | 5–3 (62%), at 600ms of thinking time |

The ordering is real, but the gaps above Pebble are narrower than the characters might suggest,
and Tenuki only pulls ahead when it is given time to think. Nothing here is calibrated against
human play, which is why you will not find a kyu rating anywhere in this repo. Reproduce with:

```bash
npm run arena -- --black kaze --white sprout --games 20
```

## How the teaching works

**The bots and the coach reason from the same code.** Every term in the evaluator is a rule a
human teacher would say out loud, and each one carries the sentence it is explained with:

```ts
{ score: -18, reason: "Self-atari: after this, the stone has only one liberty
                       and can be captured immediately." }
```

So the advice a learner reads is literally the reasoning their opponent used. The two can never
drift apart, and there is no black box to take on faith.

**Facts and opinions are kept apart.** `observe()` reports what is true about the position — your
group is in atari, there are stones you can capture, you are about twelve points behind. `advise()`
is the coach's opinion about what to play, and the learner has to ask for it.

**Hints are graduated on purpose.** Handing someone the best move teaches them to ask for the best
move, so the coach gives away as little as it can:

1. **Nudge** — "Something of yours is in danger."
2. **Area** — highlights the region, still without naming the move.
3. **Move** — the answer, with the full reasoning and the concept behind it.

The pause between those clicks is where the learning happens.

**Review is deliberately sparse.** Flagging forty imperfect moves teaches a learner that they are
bad at Go. Showing the single move that lost the game teaches them Go. `reviewGame()` grades every
move but surfaces only the two or three that mattered, plus what to study next.

## Learning aids on the board

- **Hover any stone** to light up its whole group and the liberties keeping it alive. This one
  interaction carries the most important idea in the game.
- **Territory overlay** shades who currently surrounds what.
- **Undo** takes back the bot's reply too, so you get your turn back — this is a practice space,
  not a rated ladder.
- **Every bot move** arrives with the reason it was played.
- **Save as SGF** to open a game in any Go client.

## Honesty about strength

The coach is a solid club-beginner-level guide, not a professional, and the interface says so. Its
"lost value" numbers in review are in the evaluator's own units — they are not points, and the
review states that too. The ordering is meaningful, which is all a learner needs to find the
moments worth revisiting.

Scoring assumes every stone on the board is alive, which is exactly right once both players pass
in a finished game. The engine does not attempt to judge life and death mid-game.

## Architecture

Everything runs in the browser. The SPA is a pure static build, so it deploys to an S3 bucket with
no server, no cold starts, and no per-move cost — and it keeps working offline.

```
Browser
├── React SPA ......... board, coach panel, review
└── Web Worker ........ engine + bots (MCTS never blocks the UI)

S3 + CloudFront ....... static hosting, that is the whole backend
```

MCTS spends a full second of solid CPU per move. On the main thread that is a frozen board and a
page that feels broken, which is why the worker exists.

### Planned: leaderboards and bot training

Persistence is the one thing static hosting cannot do, so it arrives as a separate, optional
service rather than something the game depends on:

- **API Gateway + Lambda + DynamoDB** for player profiles, game archives, and leaderboards.
- **Trained bot weights** published as static JSON the SPA fetches — so new personas ship without
  the browser doing any training, and the app still runs if the service is down.

See [ROADMAP.md](ROADMAP.md).

## Deploying

```bash
npm run build --workspace @baduk/web
aws s3 sync apps/web/dist s3://YOUR_BUCKET --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST --paths "/*"
```

Asset paths are relative, so the same build works from a bucket root, a subfolder, or behind
CloudFront without rebuilding. Full setup in [docs/DEPLOY.md](docs/DEPLOY.md).

## Development

```bash
npm install          # one install for the whole workspace
npm run dev          # Vite dev server for the SPA
npm test             # vitest across all packages
npm run typecheck    # tsc, strict, no emit
npm run arena -- --help
```

The arena is how persona strength claims get checked rather than assumed:

```bash
npm run arena -- --black kaze --white sprout --games 20
npm run arena -- --black tenuki --white kaze --think 2000 --watch
```

## Licence

MIT — see [LICENSE](LICENSE).
