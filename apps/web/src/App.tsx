import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BLACK,
  Game,
  WHITE,
  colorName,
  defaultKomi,
  formatVertex,
  toSgf,
  type Color,
  type Vertex,
} from '@baduk/engine';
import { PERSONAS } from '@baduk/bots';
import { HINT_LEVELS, advise, observe, reviewGame, type Advice, type GameReview } from '@baduk/coach';
import { Board } from './components/Board.js';
import { CoachPanel } from './components/CoachPanel.js';
import { GameLog, describeMove, type LogEntry } from './components/GameLog.js';
import { OpponentPicker, type GameSetup } from './components/OpponentPicker.js';
import { ReviewPanel } from './components/ReviewPanel.js';
import { useBotWorker } from './worker/useBotWorker.js';

type Phase = 'setup' | 'playing' | 'review';

const DEFAULT_SETUP: GameSetup = {
  botId: 'sprout',
  size: 9,
  handicap: 0,
  humanIsBlack: true,
  thinkMs: 1200,
};

export function App() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [setup, setSetup] = useState<GameSetup>(DEFAULT_SETUP);

  // The Game is mutable by design (it owns superko history), so it lives in a
  // ref and a version counter drives re-renders.
  const gameRef = useRef<Game>(new Game({ size: DEFAULT_SETUP.size }));
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const [hintIndex, setHintIndex] = useState(-1);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [showTerritory, setShowTerritory] = useState(false);
  const [review, setReview] = useState<GameReview | null>(null);
  const [reviewMove, setReviewMove] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const askBot = useBotWorker();
  const game = gameRef.current;
  const humanColor: Color = setup.humanIsBlack ? BLACK : WHITE;
  const botColor: Color = setup.humanIsBlack ? WHITE : BLACK;
  const persona = PERSONAS[setup.botId] ?? PERSONAS.sprout;

  const startGame = useCallback(() => {
    gameRef.current = new Game({
      size: setup.size,
      handicap: setup.handicap,
      rules: { komi: setup.handicap > 0 ? 0.5 : defaultKomi(setup.size) },
    });
    setLog([]);
    setHintIndex(-1);
    setAdvice(null);
    setReview(null);
    setReviewMove(null);
    setError(null);
    setPhase('playing');
    bump();
  }, [setup, bump]);

  const appendLog = useCallback(
    (moveNumber: number, color: Color, text: string, note?: string) => {
      setLog((entries) => [...entries, { moveNumber, color, text, ...(note ? { note } : {}) }]);
    },
    [],
  );

  const finishIfOver = useCallback(() => {
    const current = gameRef.current;
    if (!current.isOver) return false;
    setReview(reviewGame(current, { forColor: humanColor }));
    setPhase('review');
    return true;
  }, [humanColor]);

  const playHuman = useCallback(
    (vertex: Vertex) => {
      const current = gameRef.current;
      if (current.isOver || current.toPlay !== humanColor) return;
      try {
        const record = current.play({ type: 'play', vertex });
        appendLog(current.moveCount, humanColor, describeMove(current.size, record.move, record.captured.length));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return;
      }
      setAdvice(null);
      setHintIndex(-1);
      setError(null);
      bump();
      finishIfOver();
    },
    [appendLog, bump, finishIfOver, humanColor],
  );

  const humanPass = useCallback(() => {
    const current = gameRef.current;
    if (current.isOver || current.toPlay !== humanColor) return;
    current.pass();
    appendLog(current.moveCount, humanColor, 'passes');
    bump();
    finishIfOver();
  }, [appendLog, bump, finishIfOver, humanColor]);

  const humanResign = useCallback(() => {
    const current = gameRef.current;
    if (current.isOver || current.toPlay !== humanColor) return;
    current.resign();
    appendLog(current.moveCount, humanColor, 'resigns');
    bump();
    finishIfOver();
  }, [appendLog, bump, finishIfOver, humanColor]);

  /** Undo takes back the bot's reply as well, so the learner gets their turn back. */
  const undo = useCallback(() => {
    const current = gameRef.current;
    let removed = 0;
    while (removed < 2 && current.moveCount > 0) {
      current.undo();
      removed++;
      if (current.toPlay === humanColor) break;
    }
    setLog((entries) => entries.slice(0, Math.max(0, entries.length - removed)));
    setAdvice(null);
    setHintIndex(-1);
    setReview(null);
    setPhase('playing');
    bump();
  }, [bump, humanColor]);

  // --- The bot's turn -------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing') return;
    const current = gameRef.current;
    if (current.isOver || current.toPlay !== botColor || thinking) return;

    let cancelled = false;
    setThinking(true);

    askBot(current, setup.botId, setup.thinkMs)
      .then((response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError(response.error);
          return;
        }
        const record = current.play(response.move);
        appendLog(
          current.moveCount,
          botColor,
          describeMove(current.size, record.move, record.captured.length),
          response.rationale,
        );
        bump();
        finishIfOver();
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
    // `version` is the trigger: every completed move re-evaluates whose turn it is.
  }, [phase, version, botColor, askBot, setup.botId, setup.thinkMs, appendLog, bump, finishIfOver, thinking]);

  // --- Coach ----------------------------------------------------------------
  const observations = useMemo(() => {
    if (phase !== 'playing' || game.isOver || game.toPlay !== humanColor) return [];
    return observe(game, humanColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, version, humanColor, game.isOver]);

  const requestHint = useCallback(() => {
    const next = Math.min(hintIndex + 1, HINT_LEVELS.length - 1);
    setHintIndex(next);
    setAdvice(advise(gameRef.current, humanColor, { level: HINT_LEVELS[next] }));
  }, [hintIndex, humanColor]);

  const clearHint = useCallback(() => {
    setHintIndex(-1);
    setAdvice(null);
  }, []);

  const downloadSgf = useCallback(() => {
    const sgf = toSgf(gameRef.current, {
      playerBlack: setup.humanIsBlack ? 'You' : persona.name,
      playerWhite: setup.humanIsBlack ? persona.name : 'You',
      event: 'Baduk playspace',
    });
    const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `baduk-${new Date().toISOString().slice(0, 10)}.sgf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [persona.name, setup.humanIsBlack]);

  if (phase === 'setup') {
    return (
      <main className="app setup-screen">
        <OpponentPicker setup={setup} onChange={setSetup} onStart={startGame} />
      </main>
    );
  }

  const displayed = reviewMove === null ? game.position : game.positionAt(reviewMove);
  const lastRecord = game.history.at(-1);
  const lastMove =
    reviewMove === null && lastRecord && lastRecord.move.type === 'play'
      ? lastRecord.move.vertex
      : null;
  const score = game.score();
  const waiting = thinking || game.toPlay !== humanColor || game.isOver;

  return (
    <main className="app">
      <div className="board-column">
        <div className="players">
          <div className={`player${game.toPlay === humanColor && !game.isOver ? ' active' : ''}`}>
            <span className="player-avatar" aria-hidden="true">
              🧑
            </span>
            <div>
              <strong>You</strong>
              <span className="muted small">
                {colorName(humanColor)} · {game.position.captures[humanColor - 1]} captured
              </span>
            </div>
          </div>
          <div className={`player${game.toPlay === botColor && !game.isOver ? ' active' : ''}`}>
            <span className="player-avatar" aria-hidden="true">
              {persona.avatar}
            </span>
            <div>
              <strong>{persona.name}</strong>
              <span className="muted small">
                {colorName(botColor)} · {game.position.captures[botColor - 1]} captured
                {thinking ? ' · thinking…' : ''}
              </span>
            </div>
          </div>
        </div>

        <Board
          position={displayed}
          lastMove={lastMove}
          toPlay={game.toPlay}
          onPlay={playHuman}
          legal={(v) => game.isLegal({ type: 'play', vertex: v }, humanColor)}
          disabled={waiting || reviewMove !== null}
          coachHighlight={advice?.region ?? observations[0]?.highlight ?? []}
          coachMove={advice?.vertex ?? null}
          showTerritory={showTerritory}
        />

        <div className="controls">
          <button type="button" onClick={humanPass} disabled={waiting}>
            Pass
          </button>
          <button type="button" onClick={undo} disabled={game.moveCount === 0}>
            Undo
          </button>
          <button
            type="button"
            className={showTerritory ? 'toggled' : ''}
            onClick={() => setShowTerritory((on) => !on)}
          >
            Territory
          </button>
          <button type="button" onClick={humanResign} disabled={waiting}>
            Resign
          </button>
          {reviewMove !== null && (
            <button type="button" onClick={() => setReviewMove(null)}>
              Back to the end
            </button>
          )}
        </div>

        <p className="status muted small">
          {game.isOver
            ? `Game over — ${game.result?.text}`
            : `${colorName(game.toPlay)} to play · estimated score ${score.black} – ${score.white}`}
          {reviewMove !== null ? ` · showing move ${reviewMove}` : ''}
        </p>

        {error && <p className="error">{error}</p>}
      </div>

      <div className="side-column">
        {phase === 'review' && review ? (
          <ReviewPanel
            game={game}
            review={review}
            onJumpTo={setReviewMove}
            onRematch={startGame}
            onNewOpponent={() => setPhase('setup')}
            onDownloadSgf={downloadSgf}
          />
        ) : (
          <CoachPanel
            size={game.size}
            observations={observations}
            advice={advice}
            hintIndex={Math.max(0, hintIndex)}
            onHint={requestHint}
            onClearHint={clearHint}
            disabled={waiting}
          />
        )}

        <section className="log-section">
          <h2>Moves</h2>
          <GameLog entries={log} />
        </section>
      </div>
    </main>
  );
}

export { formatVertex };
