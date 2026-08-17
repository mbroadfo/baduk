import { useMemo, useState } from 'react';
import {
  BLACK,
  WHITE,
  formatVertex,
  ownership,
  starPoints,
  type Color,
  type Position,
  type Vertex,
} from '@baduk/engine';

/**
 * The board, drawn as SVG.
 *
 * SVG rather than canvas because every teaching overlay — liberty dots, group
 * highlights, territory shading, the coach's pointer — is just another element,
 * and because it stays crisp at any size on any screen.
 */

export interface BoardProps {
  readonly position: Position;
  readonly lastMove: Vertex | null;
  readonly toPlay: Color;
  readonly onPlay: (vertex: Vertex) => void;
  readonly legal: (vertex: Vertex) => boolean;
  /** Disable input while a bot is thinking or the game is over. */
  readonly disabled?: boolean;
  /** Points the coach wants to draw attention to. */
  readonly coachHighlight?: readonly Vertex[];
  /** The single point the coach is recommending, if it has given that away. */
  readonly coachMove?: Vertex | null;
  readonly showTerritory?: boolean;
  readonly showCoordinates?: boolean;
  /** Highlight the hovered group and its liberties — the core teaching aid. */
  readonly showLiberties?: boolean;
}

const CELL = 30;
const MARGIN = 26;

export function Board({
  position,
  lastMove,
  toPlay,
  onPlay,
  legal,
  disabled = false,
  coachHighlight = [],
  coachMove = null,
  showTerritory = false,
  showCoordinates = true,
  showLiberties = true,
}: BoardProps) {
  const size = position.size;
  const [hover, setHover] = useState<Vertex | null>(null);
  const extent = MARGIN * 2 + CELL * (size - 1);

  const stars = useMemo(() => new Set(starPoints(size)), [size]);
  const territory = useMemo(
    () => (showTerritory ? ownership(position) : null),
    [showTerritory, position],
  );
  const highlighted = useMemo(() => new Set(coachHighlight), [coachHighlight]);

  // Hovering a stone reveals its whole group and the liberties keeping it
  // alive. This one interaction teaches the most important idea in the game.
  const inspected = useMemo(() => {
    if (!showLiberties || hover === null || position.at(hover) === 0) return null;
    const group = position.group(hover);
    if (!group) return null;
    return { stones: new Set(group.stones), liberties: group.liberties };
  }, [hover, position, showLiberties]);

  const x = (v: Vertex) => MARGIN + (v % size) * CELL;
  const y = (v: Vertex) => MARGIN + Math.floor(v / size) * CELL;

  const labels = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

  return (
    <svg
      className="board"
      viewBox={`0 0 ${extent} ${extent}`}
      role="grid"
      aria-label={`${size} by ${size} Go board`}
      onMouseLeave={() => setHover(null)}
    >
      <rect x={0} y={0} width={extent} height={extent} rx={6} className="board-bg" />

      {/* Territory shading sits under the grid so it reads as ground, not ink. */}
      {territory &&
        Array.from({ length: position.area }, (_, v) =>
          territory[v] !== 0 && position.at(v) === 0 ? (
            <rect
              key={`t${v}`}
              x={x(v) - CELL / 2}
              y={y(v) - CELL / 2}
              width={CELL}
              height={CELL}
              className={territory[v] === BLACK ? 'territory-black' : 'territory-white'}
            />
          ) : null,
        )}

      {/* Grid */}
      {Array.from({ length: size }, (_, i) => (
        <g key={`grid${i}`}>
          <line
            x1={MARGIN}
            y1={MARGIN + i * CELL}
            x2={MARGIN + (size - 1) * CELL}
            y2={MARGIN + i * CELL}
            className="grid-line"
          />
          <line
            x1={MARGIN + i * CELL}
            y1={MARGIN}
            x2={MARGIN + i * CELL}
            y2={MARGIN + (size - 1) * CELL}
            className="grid-line"
          />
        </g>
      ))}

      {[...stars].map((v) => (
        <circle key={`star${v}`} cx={x(v)} cy={y(v)} r={3} className="star-point" />
      ))}

      {showCoordinates &&
        Array.from({ length: size }, (_, i) => (
          <g key={`label${i}`} className="coordinate">
            <text x={MARGIN + i * CELL} y={12} textAnchor="middle">
              {labels[i]}
            </text>
            <text x={10} y={MARGIN + i * CELL + 4} textAnchor="middle">
              {size - i}
            </text>
          </g>
        ))}

      {/* Coach attention ring */}
      {[...highlighted].map((v) => (
        <circle key={`hl${v}`} cx={x(v)} cy={y(v)} r={CELL * 0.45} className="coach-highlight" />
      ))}

      {/* Liberties of the hovered group */}
      {inspected?.liberties.map((v) => (
        <circle key={`lib${v}`} cx={x(v)} cy={y(v)} r={5} className="liberty-dot" />
      ))}

      {/* Stones */}
      {Array.from({ length: position.area }, (_, v) => {
        const stone = position.at(v);
        if (stone === 0) return null;
        return (
          <circle
            key={`s${v}`}
            cx={x(v)}
            cy={y(v)}
            r={CELL * 0.46}
            className={[
              'stone',
              stone === BLACK ? 'stone-black' : 'stone-white',
              inspected?.stones.has(v) ? 'stone-inspected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        );
      })}

      {lastMove !== null && position.at(lastMove) !== 0 && (
        <circle cx={x(lastMove)} cy={y(lastMove)} r={5} className="last-move" />
      )}

      {coachMove !== null && (
        <circle cx={x(coachMove)} cy={y(coachMove)} r={CELL * 0.4} className="coach-move" />
      )}

      {/* Ghost stone under the cursor, only where a move is actually legal. */}
      {!disabled && hover !== null && position.at(hover) === 0 && legal(hover) && (
        <circle
          cx={x(hover)}
          cy={y(hover)}
          r={CELL * 0.46}
          className={`ghost ${toPlay === BLACK ? 'stone-black' : 'stone-white'}`}
        />
      )}

      {/* Invisible hit targets, one per intersection. */}
      {Array.from({ length: position.area }, (_, v) => (
        <rect
          key={`hit${v}`}
          x={x(v) - CELL / 2}
          y={y(v) - CELL / 2}
          width={CELL}
          height={CELL}
          className="hit-target"
          role="gridcell"
          aria-label={`${formatVertex(size, v)}${
            position.at(v) === BLACK ? ', black stone' : position.at(v) === WHITE ? ', white stone' : ''
          }`}
          onMouseEnter={() => setHover(v)}
          onClick={() => {
            if (!disabled && position.at(v) === 0 && legal(v)) onPlay(v);
          }}
        />
      ))}
    </svg>
  );
}
