/**
 * Loads, validates and indexes content files. Works the same in the browser
 * (files bundled by Vite) and in Node (files read from disk) — callers pass a
 * map of relative path -> parsed JSON plus the rule-code modules.
 */
import { z } from 'zod';
import { compile, walk, type Expr } from './expr';
import { hashString } from './rng';
import {
  AiFileSchema,
  BalanceFileSchema,
  EducationFileSchema,
  EventSchema,
  GameSchema,
  GoalsFileSchema,
  ItemSchema,
  JobSchema,
  LocationSchema,
  MapSchema,
  RulesFileSchema,
  StatSchema,
  type ActionDef,
  type AiFile,
  type CourseDef,
  type DegreeDef,
  type EffectDef,
  type EventDef,
  type GameDef,
  type GoalsFile,
  type ItemDef,
  type JobDef,
  type LocationDef,
  type Requirement,
  type RulesFile,
  type StatDef,
} from './schema';
import type { RuleModule, RuleFunction, RuleEffect } from './rules-api';
import { BUILTIN_FUNCTIONS, KNOWN_LOCALS, PLAYER_FIELDS } from './builtins-list';

export interface NormalizedParam {
  value: number;
  vary: number;
  round: boolean;
  tune?: [number, number];
}

export interface MapIndex {
  nodes: string[];
  dist: Record<string, Record<string, number>>;
  next: Record<string, Record<string, string | null>>;
}

export interface Content {
  hash: string;
  game: GameDef;
  stats: StatDef[];
  statById: Map<string, StatDef>;
  goals: GoalsFile;
  map: MapIndex;
  locations: LocationDef[];
  locationById: Map<string, LocationDef>;
  locationByNode: Map<string, LocationDef>;
  items: ItemDef[];
  itemById: Map<string, ItemDef>;
  jobs: JobDef[];
  jobById: Map<string, JobDef>;
  degrees: DegreeDef[];
  degreeById: Map<string, DegreeDef>;
  courses: CourseDef[];
  courseById: Map<string, CourseDef>;
  events: EventDef[];
  rules: RulesFile;
  params: Record<string, NormalizedParam>;
  ai: AiFile;
  modules: RuleModule[];
  functions: Record<string, RuleFunction>;
  effects: Record<string, RuleEffect>;
}

export class ContentError extends Error {
  constructor(public problems: string[]) {
    super(`Content has ${problems.length} problem(s):\n - ${problems.join('\n - ')}`);
  }
}

function normalizeKey(k: string): string {
  return k.replace(/\\/g, '/').replace(/^.*?content\//, '');
}

function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, file: string, problems: string[]): T | undefined {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues.slice(0, 8)) {
    problems.push(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return undefined;
}

export function buildContent(rawFiles: Record<string, unknown>, modules: RuleModule[] = []): Content {
  const files: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFiles)) files[normalizeKey(k)] = v;
  const problems: string[] = [];
  const need = (name: string) => {
    if (!(name in files)) problems.push(`Missing file content/${name}`);
    return files[name];
  };

  const game = parseWith(GameSchema, need('game.json'), 'game.json', problems);
  const stats = parseWith(z.array(StatSchema), need('stats.json'), 'stats.json', problems) ?? [];
  const goals = parseWith(GoalsFileSchema, need('goals.json'), 'goals.json', problems);
  const mapDef = parseWith(MapSchema, need('map.json'), 'map.json', problems);
  const items = parseWith(z.array(ItemSchema), need('items.json'), 'items.json', problems) ?? [];
  const jobs = parseWith(z.array(JobSchema), need('jobs.json'), 'jobs.json', problems) ?? [];
  const edu = parseWith(EducationFileSchema, need('education.json'), 'education.json', problems);
  const events = parseWith(z.array(EventSchema), need('events.json'), 'events.json', problems) ?? [];
  const rules = parseWith(RulesFileSchema, need('rules.json'), 'rules.json', problems);
  const balance = parseWith(BalanceFileSchema, need('balance.json'), 'balance.json', problems);
  const ai = parseWith(AiFileSchema, need('ai.json'), 'ai.json', problems);

  const locations: LocationDef[] = [];
  for (const [k, v] of Object.entries(files)) {
    if (!k.startsWith('locations/') || !k.endsWith('.json')) continue;
    const loc = parseWith(LocationSchema, v, k, problems);
    if (loc) locations.push(loc);
  }
  locations.sort((a, b) => a.id.localeCompare(b.id));

  if (problems.length || !game || !goals || !mapDef || !edu || !rules || !balance || !ai) {
    throw new ContentError(problems);
  }

  const params: Record<string, NormalizedParam> = {};
  for (const [k, p] of Object.entries(balance.params)) {
    params[k] = typeof p === 'number' ? { value: p, vary: 0, round: false } : { value: p.value, vary: p.vary, round: p.round, tune: p.tune };
  }

  const functions: Record<string, RuleFunction> = {};
  const effects: Record<string, RuleEffect> = {};
  for (const m of modules) {
    for (const [k, f] of Object.entries(m.functions ?? {})) {
      if (BUILTIN_FUNCTIONS.has(k)) problems.push(`Rule module '${m.id}' redefines built-in function '${k}'`);
      functions[k] = f;
    }
    Object.assign(effects, m.effects ?? {});
  }

  const content: Content = {
    hash: (hashString(JSON.stringify(files)) >>> 0).toString(16),
    game,
    stats,
    statById: indexBy(stats, 'stats.json', problems),
    goals,
    map: buildMap(mapDef.nodes, mapDef.edges, problems),
    locations,
    locationById: indexBy(locations, 'locations/', problems),
    locationByNode: new Map(locations.map((l) => [l.node, l])),
    items,
    itemById: indexBy(items, 'items.json', problems),
    jobs,
    jobById: indexBy(jobs, 'jobs.json', problems),
    degrees: edu.degrees,
    degreeById: indexBy(edu.degrees, 'education.json degrees', problems),
    courses: edu.courses,
    courseById: indexBy(edu.courses, 'education.json courses', problems),
    events,
    rules,
    params,
    ai,
    modules,
    functions,
    effects,
  };

  validateReferences(content, problems);
  if (problems.length) throw new ContentError(problems);
  return content;
}

function indexBy<T extends { id: string }>(list: T[], file: string, problems: string[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list) {
    if (m.has(x.id)) problems.push(`${file}: duplicate id '${x.id}'`);
    m.set(x.id, x);
  }
  return m;
}

function buildMap(nodes: string[], edges: [string, string, number][], problems: string[]): MapIndex {
  const dist: MapIndex['dist'] = {};
  const next: MapIndex['next'] = {};
  for (const a of nodes) {
    dist[a] = {};
    next[a] = {};
    for (const b of nodes) {
      dist[a][b] = a === b ? 0 : Infinity;
      next[a][b] = a === b ? b : null;
    }
  }
  for (const [a, b, d] of edges) {
    if (!(a in dist) || !(b in dist)) {
      problems.push(`map.json: edge ${a}-${b} uses an unknown node`);
      continue;
    }
    if (d < dist[a][b]) {
      dist[a][b] = dist[b][a] = d;
      next[a][b] = b;
      next[b][a] = a;
    }
  }
  for (const k of nodes)
    for (const i of nodes)
      for (const j of nodes) {
        const via = dist[i][k] + dist[k][j];
        if (via < dist[i][j]) {
          dist[i][j] = via;
          next[i][j] = next[i][k];
        }
      }
  for (const a of nodes)
    for (const b of nodes)
      if (dist[a][b] === Infinity) {
        problems.push(`map.json: node '${b}' cannot be reached from '${a}'`);
        return { nodes, dist, next };
      }
  return { nodes, dist, next };
}

export function mapPath(map: MapIndex, from: string, to: string): string[] {
  const out = [from];
  let cur = from;
  let guard = 0;
  while (cur !== to && guard++ < 1000) {
    const n = map.next[cur][to];
    if (!n) break;
    out.push(n);
    cur = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cross-reference and expression validation
// ---------------------------------------------------------------------------

function validateReferences(c: Content, problems: string[]) {
  const letVars = new Set<string>();
  const collectLets = (effs: EffectDef[] | undefined) => {
    for (const e of effs ?? []) {
      if ('let' in e) Object.keys(e.let).forEach((k) => letVars.add(k));
      if ('then' in e) {
        collectLets(e.then);
        collectLets(e.else);
      }
      if ('pick' in e) e.pick.forEach((p) => collectLets(p.do));
    }
  };
  forEachEffectList(c, (effs) => collectLets(effs));
  for (const m of c.modules) (m.locals ?? []).forEach((l) => letVars.add(l));

  const checkExpr = (where: string, e: Expr | undefined) => {
    if (e === undefined || typeof e !== 'string') return;
    try {
      walk(compile(e), (n) => {
        if (n.t === 'call' && !BUILTIN_FUNCTIONS.has(n.name) && !(n.name in c.functions)) {
          problems.push(`${where}: unknown function '${n.name}()' in "${e}"`);
        }
        if (n.t === 'id') {
          const [head, field] = n.path;
          if (n.path.length === 1) {
            if (!c.statById.has(head) && !PLAYER_FIELDS.has(head) && !KNOWN_LOCALS.has(head) && !letVars.has(head)) {
              problems.push(`${where}: unknown name '${head}' in "${e}"`);
            }
          } else if (head === 'params') {
            if (!(field in c.params)) problems.push(`${where}: unknown parameter 'params.${field}' (add it to balance.json)`);
          } else if (head === 'world') {
            if (!(field in c.game.world) && field !== 'week') problems.push(`${where}: unknown world value 'world.${field}' (add it to game.json "world")`);
          } else if (head === 'player') {
            if (!c.statById.has(field) && !PLAYER_FIELDS.has(field)) problems.push(`${where}: unknown player field 'player.${field}'`);
          }
        }
      });
    } catch (err) {
      problems.push(`${where}: ${(err as Error).message}`);
    }
  };
  const checkReqs = (where: string, reqs: Requirement[] | undefined) => {
    for (const r of reqs ?? []) checkExpr(where, typeof r === 'string' ? r : r.test);
  };

  const checkEffects = (where: string, effs: EffectDef[] | undefined) => {
    for (const e of effs ?? []) {
      if ('add' in e || 'set' in e) {
        const rec = 'add' in e ? e.add : (e as { set: Record<string, Expr> }).set;
        for (const [k, v] of Object.entries(rec)) {
          if (!c.statById.has(k)) problems.push(`${where}: '${k}' is not a stat in stats.json`);
          checkExpr(where, v);
        }
      } else if ('let' in e) Object.values(e.let).forEach((v) => checkExpr(where, v));
      else if ('setWorld' in e) {
        for (const [k, v] of Object.entries(e.setWorld)) {
          if (!(k in c.game.world)) problems.push(`${where}: world value '${k}' is not declared in game.json "world"`);
          checkExpr(where, v);
        }
      } else if ('setFlag' in e) Object.values(e.setFlag).forEach((v) => checkExpr(where, v));
      else if ('give' in e || 'take' in e) {
        const id = 'give' in e ? e.give : (e as { take: string }).take;
        if (!c.itemById.has(id)) problems.push(`${where}: unknown item '${id}'`);
        checkExpr(where, (e as { qty?: Expr }).qty);
      } else if ('message' in e || 'say' in e) {
        const text = 'message' in e ? e.message : (e as { say: string }).say;
        for (const m of text.matchAll(/\{([^{}]+)\}/g)) checkExpr(where, m[1].trim());
      } else if ('if' in e || 'chance' in e) {
        checkExpr(where, 'if' in e ? e.if : (e as { chance: Expr }).chance);
        checkEffects(where, e.then);
        checkEffects(where, e.else);
      } else if ('pick' in e) {
        for (const p of e.pick) {
          checkExpr(where, p.weight);
          checkEffects(where, p.do);
        }
      } else if ('time' in e) checkExpr(where, e.time);
      else if ('setJob' in e) {
        if (e.setJob !== null && !c.jobById.has(e.setJob)) problems.push(`${where}: unknown job '${e.setJob}'`);
      } else if ('setHome' in e) {
        if (!c.locationById.has(e.setHome)) problems.push(`${where}: unknown location '${e.setHome}'`);
      } else if ('grantDegree' in e) {
        if (!c.degreeById.has(e.grantDegree)) problems.push(`${where}: unknown degree '${e.grantDegree}'`);
      } else if ('moveTo' in e) {
        if (!(e.moveTo in c.map.dist)) problems.push(`${where}: unknown map node '${e.moveTo}'`);
      } else if ('call' in e) {
        if (!(e.call in c.effects)) problems.push(`${where}: unknown rule-code effect '${e.call}'`);
        Object.values(e.args ?? {}).forEach((v) => checkExpr(where, v));
      }
    }
  };

  const g = c.game;
  checkExpr('game.json turnTime', g.turnTime);
  checkExpr('game.json travelTime', g.travelTime);
  checkExpr('game.json eventChance', g.eventChance);
  checkExpr('game.json maxEnrollments', g.maxEnrollments);
  for (const icon of g.hud) {
    const w = `game.json hud ${icon.id}`;
    [icon.visible, icon.warn, icon.dim, icon.badge].forEach((e) => checkExpr(w, e));
    for (const m of icon.text.matchAll(/\{([^{}]+)\}/g)) checkExpr(w, m[1].trim());
  }
  if (!c.locationById.has(g.startHome)) problems.push(`game.json: startHome '${g.startHome}' is not a location`);
  for (const [k, v] of Object.entries(g.startStats)) {
    if (!c.statById.has(k)) problems.push(`game.json startStats: '${k}' is not a stat`);
    checkExpr('game.json startStats', v);
  }
  for (const k of Object.keys(g.startItems)) if (!c.itemById.has(k)) problems.push(`game.json startItems: unknown item '${k}'`);
  if (!c.statById.has('money')) problems.push(`stats.json: a 'money' stat is required`);

  for (const s of c.stats) {
    checkExpr(`stats.json ${s.id}.min`, s.min);
    checkExpr(`stats.json ${s.id}.max`, s.max);
  }
  for (const goal of c.goals.goals) checkExpr(`goals.json ${goal.id}`, goal.score);

  for (const loc of c.locations) {
    const w = `locations/${loc.id}`;
    if (!(loc.node in c.map.dist)) problems.push(`${w}: node '${loc.node}' is not in map.json`);
    checkExpr(`${w} openIf`, loc.openIf);
    checkEffects(`${w} onArrive`, loc.onArrive);
    const ids = new Set<string>();
    for (const a of loc.actions) {
      const aw = `${w} action '${a.id}'`;
      if (ids.has(a.id)) problems.push(`${aw}: duplicate action id`);
      ids.add(a.id);
      checkExpr(aw, a.visible);
      checkExpr(aw, a.time);
      checkExpr(aw, a.cost);
      checkExpr(aw, a.ai);
      checkReqs(aw, a.requires);
      checkEffects(aw, a.effects);
      checkActionRefs(c, a, aw, problems);
    }
  }

  for (const it of c.items) {
    const w = `items.json ${it.id}`;
    [it.price, it.time, it.max, it.wearWeeks, it.value, it.sellValue, it.ai].forEach((e) => checkExpr(w, e));
    checkReqs(w, it.requires);
    checkEffects(w, it.onBuy);
    checkEffects(w, it.weekly);
  }
  for (const j of c.jobs) {
    const w = `jobs.json ${j.id}`;
    if (!c.locationById.has(j.location)) problems.push(`${w}: unknown location '${j.location}'`);
    if (j.promoteTo && !c.jobById.has(j.promoteTo)) problems.push(`${w}: promoteTo unknown job '${j.promoteTo}'`);
    [j.career, j.wage, j.shift, j.hireChance, j.openings].forEach((e) => checkExpr(w, e));
    checkReqs(w, j.requires);
    checkEffects(w, j.onWork);
  }
  for (const co of c.courses) {
    const w = `education.json course ${co.id}`;
    if (!c.locationById.has(co.location)) problems.push(`${w}: unknown location '${co.location}'`);
    if (!c.degreeById.has(co.degree)) problems.push(`${w}: unknown degree '${co.degree}'`);
    [co.fee, co.lessons, co.lessonTime].forEach((e) => checkExpr(w, e));
    checkReqs(w, co.requires);
    checkEffects(w, co.onLesson);
    checkEffects(w, co.onComplete);
  }
  for (const ev of c.events) {
    const w = `events.json ${ev.id}`;
    checkExpr(w, ev.weight);
    checkExpr(w, ev.requires);
    checkEffects(w, ev.effects);
  }
  for (const k of ['turnStart', 'weekEnd', 'afterWork', 'afterLesson', 'afterMove'] as const) {
    checkEffects(`rules.json ${k}`, c.rules[k]);
  }
  checkReqs('rules.json lessonRequires', c.rules.lessonRequires);
  checkReqs('rules.json turnEndChecks', c.rules.turnEndChecks);
  for (const n of c.ai.needs) checkExpr(`ai.json need ${n.id}`, n.value);
  for (const p of c.ai.profiles) {
    for (const k of Object.keys(p.goals)) {
      if (!c.goals.goals.some((g2) => g2.id === k)) problems.push(`ai.json profile ${p.id}: unknown goal '${k}'`);
    }
  }
}

function checkActionRefs(c: Content, a: ActionDef, where: string, problems: string[]) {
  switch (a.kind) {
    case 'shop':
      for (const id of a.items) if (!c.itemById.has(id)) problems.push(`${where}: unknown item '${id}'`);
      break;
    case 'jobs':
      for (const id of a.jobs ?? []) if (!c.jobById.has(id)) problems.push(`${where}: unknown job '${id}'`);
      break;
    case 'courses':
      for (const id of a.courses ?? []) if (!c.courseById.has(id)) problems.push(`${where}: unknown course '${id}'`);
      break;
    case 'transfer':
      if (!c.statById.has(a.from)) problems.push(`${where}: unknown stat '${a.from}'`);
      if (!c.statById.has(a.to)) problems.push(`${where}: unknown stat '${a.to}'`);
      break;
    case 'basic':
      if (!a.label) problems.push(`${where}: basic actions need a label`);
      break;
  }
}

function forEachEffectList(c: Content, fn: (effs: EffectDef[] | undefined) => void) {
  for (const loc of c.locations) {
    fn(loc.onArrive);
    loc.actions.forEach((a) => fn(a.effects));
  }
  c.items.forEach((i) => {
    fn(i.onBuy);
    fn(i.weekly);
  });
  c.jobs.forEach((j) => fn(j.onWork));
  c.courses.forEach((co) => {
    fn(co.onLesson);
    fn(co.onComplete);
  });
  c.events.forEach((e) => fn(e.effects));
  (['turnStart', 'weekEnd', 'afterWork', 'afterLesson', 'afterMove'] as const).forEach((k) => fn(c.rules[k]));
}
