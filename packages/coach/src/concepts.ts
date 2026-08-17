/**
 * The curriculum.
 *
 * Go is famously easy to learn and hard to master, and the usual failure of Go
 * software is to teach neither: it enforces the rules silently and leaves the
 * learner to infer everything else from losing. Each concept here is something
 * a human teacher says at the board, written so it can be shown at the exact
 * moment it becomes relevant.
 */

export type ConceptId =
  | 'liberties'
  | 'capture'
  | 'atari'
  | 'self-atari'
  | 'connection'
  | 'cutting'
  | 'eyes'
  | 'two-eyes'
  | 'ladder'
  | 'ko'
  | 'territory'
  | 'corners-first'
  | 'sente'
  | 'endgame'
  | 'counting';

export interface Concept {
  readonly id: ConceptId;
  readonly title: string;
  /** One sentence. This is what appears in a tooltip. */
  readonly summary: string;
  /** Why a learner should care — the motivation, not the definition. */
  readonly whyItMatters: string;
  /** A concrete thing to try on the board right now. */
  readonly tryThis: string;
  /** Rough order in which a beginner meets these ideas. */
  readonly stage: 1 | 2 | 3;
  readonly prerequisites?: readonly ConceptId[];
}

export const CONCEPTS: Record<ConceptId, Concept> = {
  liberties: {
    id: 'liberties',
    title: 'Liberties',
    summary: 'The empty points touching a stone or group are its liberties — its breathing room.',
    whyItMatters:
      'Liberties are the only thing keeping your stones on the board. Almost every fight in Go is a race to take away the other side’s liberties faster than they take yours.',
    tryThis:
      'Hover any stone to highlight its group and count the liberties. Notice how a stone in the centre starts with four and one in the corner starts with only two.',
    stage: 1,
  },
  capture: {
    id: 'capture',
    title: 'Capture',
    summary: 'Fill the last liberty of an enemy group and it is removed from the board.',
    whyItMatters:
      'Capturing is the one hard rule that turns Go from placing stones into a contest. Captured stones also count against your opponent at the end.',
    tryThis: 'Surround a single enemy stone on all four sides. The fourth stone takes it.',
    stage: 1,
    prerequisites: ['liberties'],
  },
  atari: {
    id: 'atari',
    title: 'Atari',
    summary: 'A group with exactly one liberty left is in atari — one move from being captured.',
    whyItMatters:
      'Spotting atari is the single most valuable beginner skill. Half of all beginner games are decided by someone not noticing their own group was one move from dying.',
    tryThis:
      'Before every move, scan for your own groups with one liberty. Turn on the coach’s liberty warnings if you want help at first.',
    stage: 1,
    prerequisites: ['liberties'],
  },
  'self-atari': {
    id: 'self-atari',
    title: 'Self-atari',
    summary: 'Playing a stone that leaves your own group on a single liberty.',
    whyItMatters:
      'It is legal, and it is almost always a wasted stone — you are handing your opponent a free capture. Recognising it saves more games than any opening you can memorise.',
    tryThis: 'When you are about to play next to enemy stones, count the liberties you will have *after* the move, not before.',
    stage: 1,
    prerequisites: ['atari'],
  },
  connection: {
    id: 'connection',
    title: 'Connection',
    summary: 'Stones touching along the lines are one group and share all their liberties.',
    whyItMatters:
      'Connected stones are far harder to kill than scattered ones. Two groups of three are much weaker than one group of six.',
    tryThis: 'Play a stone that joins two of your groups and watch the liberty count of the combined group jump.',
    stage: 1,
    prerequisites: ['liberties'],
  },
  cutting: {
    id: 'cutting',
    title: 'Cutting',
    summary: 'Playing between two enemy groups so they cannot join up.',
    whyItMatters:
      'Attacking usually starts with a cut. If you can split your opponent into two weak groups, you can chase one while taking profit from the other.',
    tryThis: 'Look for enemy stones that are diagonal to each other — the point between them is often a cut.',
    stage: 2,
    prerequisites: ['connection'],
  },
  eyes: {
    id: 'eyes',
    title: 'Eyes',
    summary: 'An empty point completely surrounded by one player’s stones.',
    whyItMatters:
      'Your opponent cannot fill an eye without committing suicide, so eyes are protected liberties. This is how groups become permanently safe.',
    tryThis: 'Never fill your own eye. The coach will warn you if you are about to.',
    stage: 2,
    prerequisites: ['liberties'],
  },
  'two-eyes': {
    id: 'two-eyes',
    title: 'Two eyes = life',
    summary: 'A group with two separate eyes can never be captured.',
    whyItMatters:
      'This is the deepest rule that nobody wrote down — it follows from the others. Your opponent would have to fill both eyes, but filling the first is illegal while the second still exists.',
    tryThis: 'When a group is being surrounded, stop trying to escape and ask instead: can I make two eyes right here?',
    stage: 2,
    prerequisites: ['eyes'],
  },
  ladder: {
    id: 'ladder',
    title: 'The ladder',
    summary: 'A chase where each escape move leaves the runner in atari again, all the way to the edge.',
    whyItMatters:
      'Running from a ladder that does not work loses many stones instead of one. Reading a ladder to its end is a beginner’s first taste of real calculation.',
    tryThis: 'Before running with a stone in atari, trace the chase diagonally across the board and see where it ends.',
    stage: 2,
    prerequisites: ['atari'],
  },
  ko: {
    id: 'ko',
    title: 'Ko',
    summary: 'A shape where capturing back immediately would repeat the position, so you must play elsewhere first.',
    whyItMatters:
      'Without the ko rule some games would never end. In practice ko turns into a trading game: you play a threat your opponent must answer, then take the ko back.',
    tryThis: 'When you cannot recapture, find the biggest threat elsewhere on the board and play that instead.',
    stage: 3,
    prerequisites: ['capture'],
  },
  territory: {
    id: 'territory',
    title: 'Territory',
    summary: 'Empty points surrounded by only your stones count as your points at the end.',
    whyItMatters:
      'Capturing stones feels like winning, but the game is scored on territory. Players who chase stones and ignore the board usually lose while feeling victorious.',
    tryThis: 'Turn on the territory overlay and watch how it shifts after each move.',
    stage: 2,
  },
  'corners-first': {
    id: 'corners-first',
    title: 'Corners, then sides, then centre',
    summary: 'Corners need the fewest stones to enclose territory, the centre needs the most.',
    whyItMatters:
      'The edges of the board do part of your surrounding for you. This one idea explains almost every opening move in almost every game.',
    tryThis: 'Start your game near a corner, around the third or fourth line, rather than in the middle.',
    stage: 2,
    prerequisites: ['territory'],
  },
  sente: {
    id: 'sente',
    title: 'Sente and gote',
    summary: 'Sente is a move your opponent must answer; gote is one that ends your turn there.',
    whyItMatters:
      'Keeping sente means you decide where the game happens next. It is the difference between leading a game and being dragged through it.',
    tryThis: 'After you play, ask: must they answer? If not, could you have played somewhere bigger?',
    stage: 3,
  },
  endgame: {
    id: 'endgame',
    title: 'The endgame',
    summary: 'Once borders are set, the remaining moves are about how many points each one is worth.',
    whyItMatters:
      'Beginners often lose ten or more points in the endgame by playing small moves first. It is the easiest place to gain strength quickly.',
    tryThis: 'Look for moves on the boundary between the two territories — those are usually the biggest.',
    stage: 3,
    prerequisites: ['territory'],
  },
  counting: {
    id: 'counting',
    title: 'Counting',
    summary: 'Adding up who is ahead so you know whether to play safe or start a fight.',
    whyItMatters:
      'If you are ahead, simplify. If you are behind, complicate. You cannot choose without counting first.',
    tryThis: 'Use the score estimate, but try guessing before you look.',
    stage: 3,
    prerequisites: ['territory'],
  },
};

export const CURRICULUM: readonly ConceptId[] = [
  'liberties',
  'capture',
  'atari',
  'self-atari',
  'connection',
  'eyes',
  'two-eyes',
  'territory',
  'corners-first',
  'cutting',
  'ladder',
  'ko',
  'sente',
  'endgame',
  'counting',
];

export function conceptsForStage(stage: 1 | 2 | 3): Concept[] {
  return CURRICULUM.map((id) => CONCEPTS[id]).filter((c) => c.stage === stage);
}
