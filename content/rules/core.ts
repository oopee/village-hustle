/**
 * Core rule code for the default ruleset. Add your own modules next to this file:
 * every content/rules/*.ts file that default-exports defineRules({...}) is loaded
 * automatically, in the browser and in the simulator.
 */
import { defineRules, type Ctx } from '../../src/engine/rules-api';

export default defineRules({
  id: 'core',

  functions: {
    /**
     * The season of the current week: 'summer', 'autumn', 'winter' or 'spring'.
     * Week 1 is early June; 13 weeks per season. Keep in step with src/ui/season.ts.
     */
    season: (ctx) => ['summer', 'autumn', 'winter', 'spring'][Math.floor((Math.max(1, ctx.state.week) - 1) / 13) % 4],
    /** How many months of rent the player currently owes, e.g. "rentDueMonths() >= 1". */
    rentDueMonths: (ctx) => {
      const rent = Number(ctx.player.flags.rent) || 0;
      return rent > 0 ? ctx.player.stats.rentOwed / rent : 0;
    },
    /** Full shifts worked in the current job (since being hired or promoted into it). */
    shifts: (ctx) => shiftsInJob(ctx),
    /** Raises earned in the current job: one per params.raiseShifts shifts, up to params.maxRaises. */
    raises: (ctx) => raisesInJob(ctx),
    /**
     * Wage multiplier from raises. Use it in job wage formulas. While a job's wage is being
     * worked out (local jobId), it only applies when that job is the player's current job.
     */
    payGrade: (ctx) => {
      const id = (ctx.locals.jobId as string | undefined) ?? ctx.player.job;
      if (!id || id !== ctx.player.job) return 1;
      return 1 + ctx.num('params.raiseStep') * raisesInJob(ctx);
    },
  },

  effects: {
    /**
     * Counts a worked shift towards raises (call from afterWork; args.hours = hours worked).
     * Announces a raise whenever one is earned.
     */
    countShift: (ctx, args) => {
      const p = ctx.player;
      if (!p.job) return;
      const job = ctx.content.jobById.get(p.job);
      const shift = Math.max(1, job ? ctx.num(job.shift) : 8);
      const before = raisesInJob(ctx);
      const done = shiftsInJob(ctx) + Math.min(1, (Number(args.hours) || 0) / shift);
      p.flags.shiftsJob = p.job;
      p.flags.shiftsSince = p.jobSince;
      p.flags.shifts = Math.round(done * 100) / 100;
      const after = raisesInJob(ctx);
      if (after <= before) return;
      const title = job?.title ?? p.job;
      const max = ctx.num('params.maxRaises');
      const lines =
        after >= max
          ? [
              `Another raise! You are now on the top pay grade as ${title}. Anything more would need a new job title.`,
              `The boss shakes your hand: top pay grade. "We can't pay a ${title} job any more than this. Think about it."`,
            ]
          : [
              `The boss calls you in. "You keep showing up. That's rarer than you think." You get a raise!`,
              `A raise! Turns out somebody upstairs has been counting your shifts.`,
              `Your payslip has a new line on it: a raise, for being the one who always turns up.`,
            ];
      ctx.message(lines[Math.floor(ctx.random() * lines.length)], 'good');
    },
    /** Ruins the player's best clothing item (used by the "rain" event). */
    damageBestClothes: (ctx) => {
      let bestId: string | null = null;
      let bestLevel = 0;
      for (const id of Object.keys(ctx.player.items)) {
        const level = ctx.content.itemById.get(id)?.tags.clothing ?? 0;
        if (level > bestLevel) {
          bestLevel = level;
          bestId = id;
        }
      }
      if (!bestId) return;
      const name = ctx.content.itemById.get(bestId)!.name;
      delete ctx.player.items[bestId];
      ctx.message(`A passing truck splashed you with mud. Your ${name} are ruined.`, 'bad');
    },
  },

  /**
   * Promotions: after enough shifts in a job that has a next step (promoteTo), the boss
   * may promote the player if they qualify. If they don't, the boss says what is missing
   * (once per job).
   */
  onTurnStart(ctx) {
    const p = ctx.player;
    if (!p.job) return;
    const job = ctx.content.jobById.get(p.job);
    if (!job?.promoteTo) return;
    if (shiftsInJob(ctx) < ctx.num('params.promotionShifts')) return;
    const next = ctx.content.jobById.get(job.promoteTo)!;
    if (!ctx.bool(`canWork('${next.id}')`)) {
      if (p.flags.promoHint === `${p.job}@${p.jobSince}`) return;
      const missing = next.requires.find((r) => !ctx.bool(typeof r === 'string' ? r : r.test));
      if (!missing || typeof missing === 'string') return; // the position is just taken
      p.flags.promoHint = `${p.job}@${p.jobSince}`;
      ctx.message(`Your boss would like to promote you to ${next.title}, but says: "${missing.message}"`);
      return;
    }
    const chance = ctx.num('params.promotionChance') * (1 + p.stats.reputation / 100);
    if (ctx.random() >= chance) return;
    p.job = next.id;
    p.jobSince = ctx.state.week;
    p.stats.reputation = Math.min(100, p.stats.reputation + 5);
    ctx.message(`You were promoted to ${next.title}!`, 'good');
  },
});

function shiftsInJob(ctx: Ctx): number {
  const p = ctx.player;
  if (!p.job || p.flags.shiftsJob !== p.job || p.flags.shiftsSince !== p.jobSince) return 0;
  return Number(p.flags.shifts) || 0;
}

function raisesInJob(ctx: Ctx): number {
  const every = Math.max(1, ctx.num('params.raiseShifts'));
  return Math.min(ctx.num('params.maxRaises'), Math.floor(shiftsInJob(ctx) / every));
}
