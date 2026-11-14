/**
 * The API for custom "rule code" modules in content/rules/*.ts.
 *
 * A rule module can add expression functions, effects callable from JSON
 * ({ "call": "name", "args": {...} }) and hooks into the game flow. Rule code
 * must only change state through the Ctx it receives and must use ctx.random()
 * for randomness, so games stay deterministic (needed for replays and
 * future network play).
 */
import type { Content } from './content';
import type { GameEvent, GameState, PlayerState } from './state';

export interface Ctx {
  content: Content;
  state: GameState;
  player: PlayerState;
  /** Context variables visible to expressions (price, hours, pay, ...). */
  locals: Record<string, unknown>;
  events: GameEvent[];
  /** Set to true by effects that end the player's turn. */
  endTurn: boolean;
  /** Deterministic random number in [0, 1). */
  random(): number;
  /** Evaluate an expression in this context. */
  num(expr: string | number | boolean): number;
  bool(expr: string | number | boolean): boolean;
  /** Push a message to the event stream. speaker 'host' = said by the location's owner. */
  message(text: string, tone?: 'good' | 'bad' | 'info', speaker?: 'host'): void;
}

export type RuleFunction = (ctx: Ctx, ...args: unknown[]) => unknown;
export type RuleEffect = (ctx: Ctx, args: Record<string, unknown>) => void;

export interface RuleModule {
  id: string;
  /** Functions usable in any expression, e.g. "myBonus() > 2". */
  functions?: Record<string, RuleFunction>;
  /** Effects usable from JSON as { "call": "name", "args": { ... } }. Args are evaluated expressions. */
  effects?: Record<string, RuleEffect>;
  /** Extra local variable names this module sets (so the validator accepts them). */
  locals?: string[];
  /** After the JSON turnStart rules ran for a player (from their 2nd turn). */
  onTurnStart?(ctx: Ctx): void;
  /** When a player ends their turn. */
  onTurnEnd?(ctx: Ctx): void;
  /** After all players have played a week (ctx.player is the first player). */
  onWeekEnd?(ctx: Ctx): void;
  /** After any location action completed. */
  afterAction?(ctx: Ctx, info: { location: string; action: string; option?: string }): void;
}

export function defineRules(m: RuleModule): RuleModule {
  return m;
}
