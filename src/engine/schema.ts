/**
 * Schemas for every content file under /content. These are the contract between
 * game designers (JSON + rule code) and the engine. See docs/CONTENT-GUIDE.md.
 */
import { z } from 'zod';

export const ExprSchema = z.union([z.string(), z.number(), z.boolean()]);

export type EffectDef =
  | { add: Record<string, string | number | boolean> }
  | { set: Record<string, string | number | boolean> }
  | { let: Record<string, string | number | boolean> }
  | { setWorld: Record<string, string | number | boolean> }
  | { setFlag: Record<string, string | number | boolean> }
  | { give: string; qty?: string | number | boolean }
  | { take: string; qty?: string | number | boolean }
  | { message: string; tone?: 'good' | 'bad' | 'info' }
  | { say: string; tone?: 'good' | 'bad' | 'info' }
  | { if: string | number | boolean; then: EffectDef[]; else?: EffectDef[] }
  | { chance: string | number | boolean; then: EffectDef[]; else?: EffectDef[] }
  | { pick: { weight: string | number | boolean; do: EffectDef[] }[] }
  | { time: string | number | boolean }
  | { setJob: string | null }
  | { setHome: string }
  | { grantDegree: string }
  | { moveTo: string }
  | { call: string; args?: Record<string, string | number | boolean> }
  | { endTurn: true };

const ExprRecord = z.record(ExprSchema);

export const EffectSchema: z.ZodType<EffectDef> = z.lazy(() =>
  z.union([
    z.object({ add: ExprRecord }).strict(),
    z.object({ set: ExprRecord }).strict(),
    z.object({ let: ExprRecord }).strict(),
    z.object({ setWorld: ExprRecord }).strict(),
    z.object({ setFlag: ExprRecord }).strict(),
    z.object({ give: z.string(), qty: ExprSchema.optional() }).strict(),
    z.object({ take: z.string(), qty: ExprSchema.optional() }).strict(),
    z.object({ message: z.string(), tone: z.enum(['good', 'bad', 'info']).optional() }).strict(),
    z.object({ say: z.string(), tone: z.enum(['good', 'bad', 'info']).optional() }).strict(),
    z.object({ if: ExprSchema, then: z.array(EffectSchema), else: z.array(EffectSchema).optional() }).strict(),
    z.object({ chance: ExprSchema, then: z.array(EffectSchema), else: z.array(EffectSchema).optional() }).strict(),
    z.object({ pick: z.array(z.object({ weight: ExprSchema, do: z.array(EffectSchema) }).strict()) }).strict(),
    z.object({ time: ExprSchema }).strict(),
    z.object({ setJob: z.string().nullable() }).strict(),
    z.object({ setHome: z.string() }).strict(),
    z.object({ grantDegree: z.string() }).strict(),
    z.object({ moveTo: z.string() }).strict(),
    z.object({ call: z.string(), args: ExprRecord.optional() }).strict(),
    z.object({ endTurn: z.literal(true) }).strict(),
  ]),
);

/** A requirement: a test expression plus the message shown when it fails. */
export const RequirementSchema = z.union([
  z.string(),
  z.object({ test: ExprSchema, message: z.string() }).strict(),
]);
export type Requirement = z.infer<typeof RequirementSchema>;

export const GameSchema = z
  .object({
    title: z.string(),
    subtitle: z.string().default(''),
    theme: z.string(),
    currency: z.string().default('€'),
    timeUnit: z.string().default('h'),
    players: z.object({ min: z.number().int().min(1), max: z.number().int().max(8) }).strict(),
    turnTime: ExprSchema,
    travelTime: ExprSchema,
    startHome: z.string(),
    startStats: ExprRecord.default({}),
    startItems: z.record(z.number().int()).default({}),
    world: z.record(z.number()).default({}),
    maxWeeks: z.number().int().min(1),
    eventChance: ExprSchema.default(0),
    maxEnrollments: ExprSchema.default(1),
    /**
     * When a player wins.
     * weekStart: goals must still be met at the start of the player's next turn (after the
     * weekend upkeep); the rest of that round is played, then the best qualifier wins.
     * immediate: the moment every goal is met.
     */
    winCheck: z.enum(['weekStart', 'immediate']).default('weekStart'),
    /** Suggested names on the setup screen. */
    playerNames: z.array(z.string()).default([]),
    /** Short intro text shown on the "How to play" screen. */
    intro: z.array(z.string()).default([]),
    /**
     * How durations are shown to players: instead of exact hours, each time falls into the
     * first band whose `max` it does not exceed (the last band catches the rest).
     */
    timeBands: z
      .array(z.object({ max: z.number(), label: z.string(), icon: z.string() }).strict())
      .min(1)
      .default([
        { max: 2, label: 'Quick', icon: '⏳' },
        { max: 5, label: 'Takes some time', icon: '⏳⏳' },
        { max: Infinity, label: 'Takes a lot of time', icon: '⏳⏳⏳' },
      ]),
    /**
     * Status icons, evaluated for the current player. `text` is the hover text ({expr}
     * placeholders allowed); `warn` paints the icon red, `dim` greys it out. Only `bar` icons
     * sit in the top bar; the rest are listed in the Status window.
     */
    hud: z
      .array(
        z
          .object({
            id: z.string(),
            icon: z.string(),
            text: z.string(),
            bar: z.boolean().default(false),
            visible: ExprSchema.optional(),
            warn: ExprSchema.optional(),
            dim: ExprSchema.optional(),
            /** A short badge drawn on the icon, e.g. a count. */
            badge: ExprSchema.optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const StatSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    default: z.number().default(0),
    min: ExprSchema.default(0),
    max: ExprSchema.optional(),
    /** money: shown as currency; number; bar (0..max as a meter); hidden: never shown to players */
    display: z.enum(['money', 'number', 'bar', 'hidden']).default('hidden'),
    description: z.string().optional(),
  })
  .strict();

export const GoalSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    /** Expression evaluated for a player; clamped to 0..100. */
    score: ExprSchema,
    defaultTarget: z.number().min(0).max(100),
  })
  .strict();

export const GoalsFileSchema = z
  .object({
    targetMin: z.number().default(10),
    targetMax: z.number().default(100),
    goals: z.array(GoalSchema).min(1),
  })
  .strict();

export const MapSchema = z
  .object({
    nodes: z.array(z.string()).min(1),
    /** [nodeA, nodeB, distance] — undirected. */
    edges: z.array(z.tuple([z.string(), z.string(), z.number().positive()])),
  })
  .strict();

const ActionBase = {
  id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  /** Hides the action entirely when false. */
  visible: ExprSchema.optional(),
  time: ExprSchema.optional(),
  cost: ExprSchema.optional(),
  requires: z.array(RequirementSchema).optional(),
  /** Extra effects run after the action's built-in behaviour. */
  effects: z.array(EffectSchema).optional(),
  /** Optional hint for computer players: extra desirability score. */
  ai: ExprSchema.optional(),
};

export const ActionSchema = z.discriminatedUnion('kind', [
  z.object({ ...ActionBase, kind: z.literal('basic') }).strict(),
  z.object({ ...ActionBase, kind: z.literal('shop'), items: z.array(z.string()).min(1) }).strict(),
  z.object({ ...ActionBase, kind: z.literal('jobs'), jobs: z.array(z.string()).optional() }).strict(),
  z.object({ ...ActionBase, kind: z.literal('work') }).strict(),
  z.object({ ...ActionBase, kind: z.literal('courses'), courses: z.array(z.string()).optional() }).strict(),
  z
    .object({
      ...ActionBase,
      kind: z.literal('transfer'),
      from: z.string(),
      to: z.string(),
      amounts: z.array(z.number().positive()).default([10, 50, 100]),
      allowAll: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      ...ActionBase,
      kind: z.literal('sell'),
      categories: z.array(z.string()).min(1),
    })
    .strict(),
]);

export const LocationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    node: z.string(),
    description: z.string().default(''),
    greeting: z.array(z.string()).default([]),
    /** When false, the location is closed and its message shown instead of actions. */
    openIf: ExprSchema.optional(),
    closedText: z.string().optional(),
    /**
     * The owner / clerk who runs the place. Pure flavour: the UI draws them in the
     * interior and shows their lines as speech bubbles. `lines` maps a situation to
     * a list of lines picked at random (see docs/CONTENT-GUIDE.md, "Hosts").
     */
    host: z
      .object({
        name: z.string(),
        title: z.string().optional(),
        lines: z.record(z.array(z.string())).default({}),
      })
      .strict()
      .optional(),
    /**
     * Things in the room the player can click for a laugh (the cat, a clock, a regular at
     * the corner table...). Keys are the ids of the theme's props / extras in this interior.
     * Pure flavour: a random line is shown in a bubble; nothing in the game changes.
     * With a `name`, the line is spoken (the speaker's name is shown and they get a voice).
     */
    pokes: z
      .record(z.object({ name: z.string().optional(), lines: z.array(z.string()).min(1) }).strict())
      .default({}),
    /** Effects run each time a player arrives here. */
    onArrive: z.array(EffectSchema).optional(),
    actions: z.array(ActionSchema).default([]),
  })
  .strict();

export const ItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    description: z.string().default(''),
    price: ExprSchema,
    /** Time to buy (overrides the shop action's time). */
    time: ExprSchema.optional(),
    /** Consumables are used up on purchase (only onBuy runs); others go to inventory. */
    consumable: z.boolean().default(false),
    /** Maximum owned at once (non-consumables). Default 1. */
    max: ExprSchema.optional(),
    tags: z.record(z.number()).default({}),
    /** Weeks until the item wears out and disappears. */
    wearWeeks: ExprSchema.optional(),
    /** Asset value counted e.g. in wealth; default 0. */
    value: ExprSchema.optional(),
    /** Price when sold back; default 0 (cannot be sold). */
    sellValue: ExprSchema.optional(),
    requires: z.array(RequirementSchema).optional(),
    onBuy: z.array(EffectSchema).optional(),
    /** Run at the start of each of the owner's turns. */
    weekly: z.array(EffectSchema).optional(),
    wornOutText: z.string().optional(),
    ai: ExprSchema.optional(),
  })
  .strict();

export const JobSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    location: z.string(),
    description: z.string().default(''),
    /** Career rating 0..100 (used by goals). */
    career: ExprSchema,
    /** Pay per time unit. */
    wage: ExprSchema,
    /** Length of a full shift. */
    shift: ExprSchema,
    requires: z.array(RequirementSchema).default([]),
    hireChance: ExprSchema.default(1),
    /** How many players can hold this job at once (default: unlimited). */
    openings: ExprSchema.optional(),
    rejectText: z.string().optional(),
    promoteTo: z.string().optional(),
    onWork: z.array(EffectSchema).optional(),
  })
  .strict();

export const DegreeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    points: z.number(),
  })
  .strict();

export const CourseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    location: z.string(),
    degree: z.string(),
    description: z.string().default(''),
    fee: ExprSchema,
    lessons: ExprSchema,
    lessonTime: ExprSchema,
    requires: z.array(RequirementSchema).default([]),
    onLesson: z.array(EffectSchema).optional(),
    onComplete: z.array(EffectSchema).optional(),
  })
  .strict();

export const EducationFileSchema = z
  .object({
    degrees: z.array(DegreeSchema),
    courses: z.array(CourseSchema),
  })
  .strict();

export const EventSchema = z
  .object({
    id: z.string(),
    weight: ExprSchema.default(1),
    requires: ExprSchema.optional(),
    effects: z.array(EffectSchema),
  })
  .strict();

export const RulesFileSchema = z
  .object({
    /** Each player's weekly upkeep, run at the start of their turn (from week 2). */
    turnStart: z.array(EffectSchema).default([]),
    /** World update after every player has played the week. Use setWorld. */
    weekEnd: z.array(EffectSchema).default([]),
    afterWork: z.array(EffectSchema).default([]),
    afterLesson: z.array(EffectSchema).default([]),
    afterMove: z.array(EffectSchema).default([]),
    /** Extra requirements for attending any lesson (e.g. a weekly lesson limit). */
    lessonRequires: z.array(RequirementSchema).default([]),
    /** Shown when a player ends their week early, e.g. "No food at home". Uses requirement syntax: the message shows when the test FAILS. */
    turnEndChecks: z.array(RequirementSchema).default([]),
    /** Random hints for "advice" style actions: ruleset-defined text snippets. */
    hints: z.array(z.string()).default([]),
  })
  .strict();

export const ParamSchema = z.union([
  z.number(),
  z
    .object({
      value: z.number(),
      /** Fraction of random variation per game when randomization is enabled (0.1 = ±10%). */
      vary: z.number().min(0).max(1).default(0),
      /** Round to whole numbers after variation. */
      round: z.boolean().default(false),
      /** Range the auto-tuner may search. Omit to keep the parameter fixed. */
      tune: z.tuple([z.number(), z.number()]).optional(),
      note: z.string().optional(),
    })
    .strict(),
]);

export const BalanceFileSchema = z
  .object({
    params: z.record(ParamSchema),
  })
  .strict();

export const AiProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Weight per goal id (default 1). */
    goals: z.record(z.number()).default({}),
    /** Multiplier for the shared "needs" terms. */
    caution: z.number().default(1),
    /** 0 = always best move, 1 = often picks among top choices. */
    randomness: z.number().min(0).max(1).default(0.1),
  })
  .strict();

export const AiFileSchema = z
  .object({
    /** Evaluated per player: value * weight is added to the bot's position score. */
    needs: z.array(z.object({ id: z.string(), value: ExprSchema, weight: z.number() }).strict()).default([]),
    profiles: z.array(AiProfileSchema).min(1),
  })
  .strict();

export type GameDef = z.infer<typeof GameSchema>;
export type StatDef = z.infer<typeof StatSchema>;
export type GoalDef = z.infer<typeof GoalSchema>;
export type GoalsFile = z.infer<typeof GoalsFileSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type ActionDef = z.infer<typeof ActionSchema>;
export type LocationDef = z.infer<typeof LocationSchema>;
export type ItemDef = z.infer<typeof ItemSchema>;
export type JobDef = z.infer<typeof JobSchema>;
export type DegreeDef = z.infer<typeof DegreeSchema>;
export type CourseDef = z.infer<typeof CourseSchema>;
export type EventDef = z.infer<typeof EventSchema>;
export type RulesFile = z.infer<typeof RulesFileSchema>;
export type ParamDef = z.infer<typeof ParamSchema>;
export type AiFile = z.infer<typeof AiFileSchema>;
export type AiProfile = z.infer<typeof AiProfileSchema>;
