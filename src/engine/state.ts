/**
 * Game state, actions and events. All of these are plain JSON-serializable data:
 * the state can be saved, sent over a network, and replayed by applying the
 * same actions to the same initial state.
 */

export interface PlayerState {
  id: string;
  name: string;
  /** Index into the theme's player colors. */
  color: number;
  controller: 'human' | 'ai';
  aiProfile?: string;
  node: string;
  home: string;
  timeLeft: number;
  stats: Record<string, number>;
  items: Record<string, { qty: number; age: number }>;
  job: string | null;
  jobSince: number;
  degrees: string[];
  /** Enrolled course id -> lessons completed. */
  courses: Record<string, number>;
  flags: Record<string, string | number | boolean>;
  turnsTaken: number;
}

export interface GameSettings {
  goals: Record<string, number>;
  randomizeBalance: boolean;
}

export interface GameState {
  version: 1;
  contentHash: string;
  seed: string;
  rng: number;
  week: number;
  /** Index of the player whose turn it is. */
  current: number;
  phase: 'playing' | 'ended';
  params: Record<string, number>;
  world: Record<string, number>;
  settings: GameSettings;
  players: PlayerState[];
  winner: string | null;
  endReason?: 'goals' | 'maxWeeks';
  /**
   * Players who started a turn with every goal met. The rest of that round is
   * played out, then the best of them wins (see game.winCheck).
   */
  qualified?: string[];
}

export interface PlayerSetup {
  name: string;
  color: number;
  controller: 'human' | 'ai';
  aiProfile?: string;
}

export interface GameSetup {
  players: PlayerSetup[];
  goals?: Record<string, number>;
  randomizeBalance?: boolean;
  seed?: string;
}

export type Action =
  | { type: 'move'; player: string; to: string }
  | { type: 'do'; player: string; action: string; option?: string }
  | { type: 'endTurn'; player: string };

export type Tone = 'good' | 'bad' | 'info';

export type GameEvent =
  /** speaker 'host': said by the owner of the location the player is at (UI shows a speech bubble). */
  | { type: 'message'; player?: string; text: string; tone: Tone; speaker?: 'host' }
  /** `late`: the week ran out on the way; the turn ends right after. */
  | { type: 'moved'; player: string; path: string[]; time: number; late?: boolean }
  | { type: 'did'; player: string; location: string; action: string; option?: string; label: string }
  | { type: 'turnStarted'; player: string; week: number }
  /** `path` is the walk home (map nodes, starting where the player was); a single node if already home. */
  | { type: 'turnEnded'; player: string; path: string[] }
  | { type: 'weekEnded'; week: number }
  | { type: 'gameOver'; winner: string | null; reason: 'goals' | 'maxWeeks' };

export class ActionError extends Error {}

export function clonePlayer(p: PlayerState): PlayerState {
  const items: PlayerState['items'] = {};
  for (const k in p.items) items[k] = { qty: p.items[k].qty, age: p.items[k].age };
  return {
    ...p,
    stats: { ...p.stats },
    items,
    degrees: [...p.degrees],
    courses: { ...p.courses },
    flags: { ...p.flags },
  };
}

/** Fast structural clone. params and settings never change after creation, so they are shared. */
export function cloneState(s: GameState): GameState {
  return { ...s, world: { ...s.world }, players: s.players.map(clonePlayer) };
}
