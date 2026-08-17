import { BLACK, formatVertex, type Color } from '@baduk/engine';

export interface LogEntry {
  readonly moveNumber: number;
  readonly color: Color;
  readonly text: string;
  /** Bot rationale, or the coach's note on your move. */
  readonly note?: string;
}

export interface GameLogProps {
  readonly entries: readonly LogEntry[];
}

/**
 * The running commentary. Every bot move arrives with the reason it was played,
 * which is the difference between an opponent and a sparring partner.
 */
export function GameLog({ entries }: GameLogProps) {
  if (entries.length === 0) {
    return (
      <div className="log empty muted small">
        Moves and the reasoning behind them will appear here.
      </div>
    );
  }

  return (
    <ol className="log">
      {entries
        .slice()
        .reverse()
        .map((entry) => (
          <li key={entry.moveNumber} className="log-entry">
            <span className={`log-stone ${entry.color === BLACK ? 'black' : 'white'}`} aria-hidden="true" />
            <div>
              <span className="log-move">
                {entry.moveNumber}. {entry.text}
              </span>
              {entry.note && <p className="log-note">{entry.note}</p>}
            </div>
          </li>
        ))}
    </ol>
  );
}

export function describeMove(
  size: number,
  move: { type: 'play'; vertex: number } | { type: 'pass' } | { type: 'resign' },
  captured: number,
): string {
  if (move.type === 'pass') return 'passes';
  if (move.type === 'resign') return 'resigns';
  const label = formatVertex(size, move.vertex);
  return captured > 0 ? `${label} — takes ${captured}` : label;
}
