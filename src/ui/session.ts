/**
 * The UI talks to a game only through GameSession. LocalSession runs the engine
 * in the browser (hot-seat). A future NetworkSession would send the same Action
 * objects to a server running the same engine and receive the same events back.
 */
import { applyAction, type Action, type Content, type GameEvent, type GameState, type Tone } from '../engine';
import { storageGet, storageSet } from './dom';

export interface LogEntry {
  week: number;
  player?: string;
  text: string;
  tone: Tone;
}

export interface GameSession {
  readonly content: Content;
  readonly state: GameState;
  readonly log: LogEntry[];
  /** Applies an action. Rejects with ActionError if the action is not allowed. */
  submit(action: Action): Promise<GameEvent[]>;
  /** True if this client may act for the given player (hot-seat: always). */
  controls(playerId: string): boolean;
  dispose(): void;
}

const SAVE_KEY = 'village-hustle:save';
const LOG_LIMIT = 300;

interface SaveFile {
  contentHash: string;
  savedAt: number;
  state: GameState;
  log: LogEntry[];
}

export class LocalSession implements GameSession {
  constructor(
    readonly content: Content,
    public state: GameState,
    readonly log: LogEntry[] = [],
  ) {}

  async submit(action: Action): Promise<GameEvent[]> {
    const { state, events } = applyAction(this.content, this.state, action);
    const startWeek = this.state.week;
    this.state = state;
    this.addToLog(events, startWeek);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    this.save();
    return events;
  }

  /** Records events produced outside submit (e.g. game creation). */
  record(events: GameEvent[]) {
    this.addToLog(events, this.state.week);
    this.save();
  }

  private addToLog(events: GameEvent[], week: number) {
    for (const e of events) {
      if (e.type === 'weekEnded') week = e.week + 1;
      else if (e.type === 'message') this.log.push({ week, player: e.player, text: e.text, tone: e.tone });
    }
  }

  controls(): boolean {
    return true;
  }

  save() {
    if (this.state.phase === 'ended') {
      clearSave();
      return;
    }
    const file: SaveFile = { contentHash: this.content.hash, savedAt: Date.now(), state: this.state, log: this.log };
    storageSet(SAVE_KEY, file);
  }

  dispose() {}
}

export type SaveStatus = { kind: 'none' } | { kind: 'ok'; session: LocalSession; savedAt: number } | { kind: 'outdated' };

export function findSave(content: Content): SaveStatus {
  const file = storageGet<SaveFile | null>(SAVE_KEY, null);
  if (!file || !file.state) return { kind: 'none' };
  if (file.contentHash !== content.hash) return { kind: 'outdated' };
  return { kind: 'ok', session: new LocalSession(content, file.state, file.log ?? []), savedAt: file.savedAt };
}

export function clearSave() {
  storageSet(SAVE_KEY, undefined);
}
