import { formatVertex, type Game } from '@baduk/engine';
import { CONCEPTS, type GameReview } from '@baduk/coach';

export interface ReviewPanelProps {
  readonly game: Game;
  readonly review: GameReview;
  readonly onJumpTo: (moveNumber: number) => void;
  readonly onRematch: () => void;
  readonly onNewOpponent: () => void;
  readonly onDownloadSgf: () => void;
}

/**
 * The screen that actually makes someone better.
 *
 * It shows two or three moments, not forty. A learner who is handed a list of
 * every imperfect move learns that they are bad at Go; one who is shown the
 * single move that lost the game learns Go.
 */
export function ReviewPanel({
  game,
  review,
  onJumpTo,
  onRematch,
  onNewOpponent,
  onDownloadSgf,
}: ReviewPanelProps) {
  return (
    <section className="review">
      <h2>How that went</h2>
      <p className="review-summary">{review.summary}</p>

      <div className="accuracy">
        <div>
          <span className="accuracy-value">{review.accuracy.black}%</span>
          <span className="muted small">Black solid moves</span>
        </div>
        <div>
          <span className="accuracy-value">{review.accuracy.white}%</span>
          <span className="muted small">White solid moves</span>
        </div>
      </div>

      {review.keyMoments.length > 0 && (
        <>
          <h3>Moments worth revisiting</h3>
          <ol className="key-moments">
            {review.keyMoments.map((moment) => (
              <li key={moment.number} className={`moment ${moment.grade}`}>
                <button type="button" onClick={() => onJumpTo(moment.number)}>
                  <span className="moment-number">Move {moment.number}</span>
                  <span className={`grade ${moment.grade}`}>{moment.grade}</span>
                </button>
                <p>{moment.comment}</p>
                {moment.betterMove !== undefined && (
                  <p className="better">
                    Instead: <strong>{formatVertex(game.size, moment.betterMove)}</strong> —{' '}
                    {moment.betterReason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {review.studyNext.length > 0 && (
        <>
          <h3>What to work on next</h3>
          <ul className="study-list">
            {review.studyNext.map((id) => {
              const concept = CONCEPTS[id];
              return (
                <li key={id}>
                  <strong>{concept.title}</strong>
                  <p>{concept.whyItMatters}</p>
                  <p className="try-this">
                    <strong>Try this:</strong> {concept.tryThis}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="review-actions">
        <button type="button" className="primary" onClick={onRematch}>
          Play again
        </button>
        <button type="button" onClick={onNewOpponent}>
          Different opponent
        </button>
        <button type="button" onClick={onDownloadSgf}>
          Save game (SGF)
        </button>
      </div>
    </section>
  );
}
