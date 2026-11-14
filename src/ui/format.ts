import { makeCtx, type Content, type GameState, type PlayerState } from '../engine';

export function money(content: Content, n: number): string {
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString('en-US');
  return `${v < 0 ? '-' : ''}${content.game.currency}${s}`;
}

export function hours(content: Content, n: number): string {
  return `${Math.round(n)}${content.game.timeUnit}`;
}

/** Maximum of a stat for display (stat max can be an expression). */
export function statMaxFor(content: Content, state: GameState, p: PlayerState, id: string): number | undefined {
  const def = content.statById.get(id);
  if (!def || def.max === undefined) return undefined;
  return makeCtx(content, state, p, []).num(def.max);
}

export function jobWage(content: Content, state: GameState, p: PlayerState): number {
  if (!p.job) return 0;
  const job = content.jobById.get(p.job);
  if (!job) return 0;
  return makeCtx(content, state, p, [], { jobId: p.job }).num(job.wage);
}
