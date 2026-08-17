# Roadmap

The organising principle: **playing must never require a backend.** Everything below is additive —
if the API is down, or never gets built, the game still works.

## Shipped (v0.1)

- Rules engine: captures, suicide, ko, positional superko, area and territory scoring, handicap,
  SGF import/export, and a tactics layer (atari, ladder reading, influence).
- Four bot personas with a shared, legible evaluator; MCTS for the strongest.
- Coach: live observations, three-tier hints, 15-concept curriculum, post-game review.
- React SPA with liberty highlighting, territory overlay, undo, and SGF download.
- Bot-vs-bot arena for tuning and engine stress-testing.

## Next: teaching depth

The coach currently explains *moves*. It should explain *shapes and sequences*.

- **Life-and-death recognition.** Detect eye space, false eyes, and the standard dead shapes so
  the coach can say "this group cannot make two eyes" — the single biggest gap today, since
  scoring assumes everything on the board is alive.
- **Guided lessons.** Fixed positions with a goal ("capture these three stones", "make this group
  live") that check the answer and explain the failure. The curriculum in
  `packages/coach/src/concepts.ts` is already ordered for this.
- **Opening patterns.** A small joseki library so Kaze plays recognisable corner sequences and the
  coach can name them.
- **Better ladder reading.** The current reader bails after 64 plies and treats an unresolved read
  as an escape; it should also spot ladder-breakers.

## Next: the playspace

- **Local two-player mode** — two humans on one screen, with the coach watching both.
- **Position editor and puzzle sharing** via SGF or a URL fragment, so a shared link needs no
  backend at all.
- **Move-by-move replay** with the review annotations inline.
- **Sound and animation** for captures. Small, but it is most of what makes a game feel alive.
- **Accessibility pass**: full keyboard play, screen-reader board narration.

## Then: persistence (the first backend)

Only once there is something worth saving.

- **API Gateway + Lambda + DynamoDB** behind the same CloudFront distribution at `/api/*`.
- **Player profiles**: games played, concepts practised, which mistakes recur.
- **Leaderboards**: human ladder, and a bot ladder scored from arena results rather than claimed
  ranks.
- **Game archive** with shareable review links.

Design constraint: the SPA reads and writes this opportunistically. A failed request degrades to
local-only play, never a blocked game.

## Then: bots in training

- **Self-play tuning** of the evaluator weights in `packages/bots/src/evaluate.ts`, run in the
  arena rather than in the browser.
- **Trained weights published as static JSON** in the same S3 bucket. The SPA fetches them like any
  other asset; the browser never trains anything.
- **A small policy network** as a further persona, kept honest by the same rule: it must be able to
  explain its move, or it does not ship as a teaching opponent.
- **Persona calibration** — run every pairing through the arena and set the displayed ranks from
  measured win rates instead of estimates. Partially done; see the strength table in the README.

## Known limitations

These are stated in the interface too, not just here.

- **Scoring assumes all stones are alive.** Correct for a finished game, wrong for a position where
  a dead group is still sitting on the board. Dead-stone marking is the fix, and it depends on the
  life-and-death work above.
- **The coach is club-beginner strength.** It will sometimes be confidently wrong. It says so.
- **"Lost value" in review is in evaluator units, not points.** The ordering is meaningful; the
  magnitude is not a point count.
- **Tenuki slows down on 19×19.** MCTS with random playouts scales poorly with board size; 9×9 is
  where it is honest.
