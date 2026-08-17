import { formatVertex } from '@baduk/engine';
import { CONCEPTS, HINT_LEVELS, type Advice, type Observation } from '@baduk/coach';

export interface CoachPanelProps {
  readonly size: number;
  readonly observations: readonly Observation[];
  readonly advice: Advice | null;
  readonly hintIndex: number;
  readonly onHint: () => void;
  readonly onClearHint: () => void;
  readonly disabled: boolean;
}

/**
 * The coach's voice.
 *
 * Two distinct things live here and are kept visually distinct: observations,
 * which are facts about the position and are always on, and advice, which is an
 * opinion the learner has to ask for. Blurring them would train a learner to
 * wait for instructions instead of reading the board.
 */
export function CoachPanel({
  size,
  observations,
  advice,
  hintIndex,
  onHint,
  onClearHint,
  disabled,
}: CoachPanelProps) {
  const concept = advice?.concept ? CONCEPTS[advice.concept] : null;
  const canGoDeeper = hintIndex < HINT_LEVELS.length - 1;

  return (
    <aside className="coach">
      <div className="coach-head">
        <span className="coach-avatar" aria-hidden="true">
          🧭
        </span>
        <div>
          <h2>Coach</h2>
          <p className="muted small">Watching the board with you</p>
        </div>
      </div>

      {observations.length > 0 && (
        <ul className="observations">
          {observations.slice(0, 3).map((note, index) => (
            <li key={`${note.headline}-${index}`} className={`observation ${note.kind}`}>
              <strong>{note.headline}</strong>
              <p>{note.detail}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="hint-box">
        {advice === null ? (
          <>
            <p className="muted">
              Stuck? Ask for a hint. The coach starts vague on purpose — the thinking you do before
              the answer is the part that makes you stronger.
            </p>
            <button type="button" className="primary" onClick={onHint} disabled={disabled}>
              Give me a hint
            </button>
          </>
        ) : (
          <>
            <div className="hint-level">
              Hint {hintIndex + 1} of {HINT_LEVELS.length}
            </div>
            <h3>{advice.headline}</h3>
            <p>{advice.detail}</p>
            {advice.vertex !== undefined && (
              <p className="hint-answer">
                The coach would play <strong>{formatVertex(size, advice.vertex)}</strong>.
              </p>
            )}

            {concept && (
              <details className="concept">
                <summary>{concept.title}</summary>
                <p>{concept.whyItMatters}</p>
                <p className="try-this">
                  <strong>Try this:</strong> {concept.tryThis}
                </p>
              </details>
            )}

            <div className="hint-actions">
              {canGoDeeper && (
                <button type="button" className="primary" onClick={onHint} disabled={disabled}>
                  Tell me more
                </button>
              )}
              <button type="button" onClick={onClearHint}>
                I&apos;ve got it
              </button>
            </div>

            {advice.alternatives.length > 1 && hintIndex === HINT_LEVELS.length - 1 && (
              <details className="alternatives">
                <summary>Other moves the coach considered</summary>
                <ol>
                  {advice.alternatives.slice(1, 5).map((candidate) => (
                    <li key={candidate.vertex}>
                      <strong>{formatVertex(size, candidate.vertex)}</strong> — {candidate.reason}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </div>

      <p className="disclaimer small muted">
        The coach plays at about a decent club beginner&apos;s level. It is a guide, not an oracle —
        if a move looks good to you and the coach disagrees, it is worth working out why.
      </p>
    </aside>
  );
}
