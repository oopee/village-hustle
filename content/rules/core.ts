/**
 * Core rule code for the default ruleset. Add your own modules next to this file:
 * every content/rules/*.ts file that default-exports defineRules({...}) is loaded
 * automatically, in the browser and in the simulator.
 */
import { defineRules } from '../../src/engine/rules-api';

export default defineRules({
  id: 'core',

  functions: {
    /** How many weeks of rent the player currently owes, e.g. "rentDueWeeks() > 2". */
    rentDueWeeks: (ctx) => {
      const rent = ctx.num('params.rentFlat * world.economy');
      return rent > 0 ? ctx.player.stats.rentOwed / rent : 0;
    },
  },

  effects: {
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

  /** Promotions: after enough weeks in a job, a player may be promoted if they qualify. */
  onTurnStart(ctx) {
    const p = ctx.player;
    if (!p.job) return;
    const job = ctx.content.jobById.get(p.job);
    if (!job?.promoteTo) return;
    const weeks = ctx.state.week - p.jobSince;
    if (weeks < ctx.num('params.promotionWeeks')) return;
    if (!ctx.bool(`canWork('${job.promoteTo}')`)) return;
    const chance = ctx.num('params.promotionChance') * (1 + p.stats.reputation / 100);
    if (ctx.random() >= chance) return;
    const next = ctx.content.jobById.get(job.promoteTo)!;
    p.job = next.id;
    p.jobSince = ctx.state.week;
    p.stats.reputation = Math.min(100, p.stats.reputation + 5);
    ctx.message(`You were promoted to ${next.title}!`, 'good');
  },
});
