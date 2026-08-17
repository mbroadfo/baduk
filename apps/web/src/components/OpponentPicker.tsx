import { listPersonas } from '@baduk/bots';
import { SUPPORTED_SIZES } from '@baduk/engine';

export interface GameSetup {
  readonly botId: string;
  readonly size: number;
  readonly handicap: number;
  readonly humanIsBlack: boolean;
  readonly thinkMs: number;
}

export interface OpponentPickerProps {
  readonly setup: GameSetup;
  readonly onChange: (setup: GameSetup) => void;
  readonly onStart: () => void;
}

/**
 * The first screen. It doubles as a lesson: each opponent states what it
 * teaches and where it is weak, so choosing one is a decision about what you
 * want to work on rather than which difficulty number you deserve.
 */
export function OpponentPicker({ setup, onChange, onStart }: OpponentPickerProps) {
  const personas = listPersonas();

  return (
    <div className="setup">
      <header className="setup-header">
        <h1>Baduk</h1>
        <p className="lede">
          Go is the oldest board game still played in its original form, and the rules fit on a
          napkin. Pick someone to play, and the coach will explain the rest as you go.
        </p>
      </header>

      <section>
        <h2>Choose an opponent</h2>
        <div className="persona-grid">
          {personas.map((persona) => {
            const selected = persona.id === setup.botId;
            return (
              <button
                key={persona.id}
                type="button"
                className={`persona-card${selected ? ' selected' : ''}`}
                style={{ '--accent': persona.accent } as React.CSSProperties}
                onClick={() => onChange({ ...setup, botId: persona.id })}
                aria-pressed={selected}
              >
                <span className="persona-avatar" aria-hidden="true">
                  {persona.avatar}
                </span>
                <span className="persona-name">
                  {persona.name} <span className="persona-rank">{persona.rank}</span>
                </span>
                <span className="persona-tagline">{persona.tagline}</span>
                <span className="persona-detail">
                  <strong>Teaches</strong> {persona.teaches}
                </span>
                <span className="persona-detail muted">
                  <strong>Weak at</strong> {persona.weakness}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="setup-options">
        <label>
          <span>Board size</span>
          <select
            value={setup.size}
            onChange={(event) => onChange({ ...setup, size: Number(event.target.value) })}
          >
            {SUPPORTED_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}×{size}
                {size === 9 ? ' — best for learning' : size === 19 ? ' — full size' : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Handicap</span>
          <select
            value={setup.handicap}
            onChange={(event) => onChange({ ...setup, handicap: Number(event.target.value) })}
          >
            <option value={0}>None — even game</option>
            {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} stones for you
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>You play</span>
          <select
            value={setup.humanIsBlack ? 'black' : 'white'}
            onChange={(event) => onChange({ ...setup, humanIsBlack: event.target.value === 'black' })}
          >
            <option value="black">Black — moves first</option>
            <option value="white">White — gets komi</option>
          </select>
        </label>

        <label>
          <span>Bot thinking time</span>
          <select
            value={setup.thinkMs}
            onChange={(event) => onChange({ ...setup, thinkMs: Number(event.target.value) })}
          >
            <option value={400}>Fast — 0.4s</option>
            <option value={1200}>Normal — 1.2s</option>
            <option value={3000}>Careful — 3s</option>
          </select>
        </label>
      </section>

      <button type="button" className="primary start" onClick={onStart}>
        Start playing
      </button>
    </div>
  );
}
