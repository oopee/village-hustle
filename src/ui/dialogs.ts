/** Read-only views: player status, goals overview, message log. */
import { goalScores, hudIcons, type Content, type GameState, type PlayerState } from '../engine';
import { h } from './dom';
import { jobWage, money, statMaxFor } from './format';
import type { LogEntry } from './session';
import type { Theme } from './theme';

export function swatch(theme: Theme, color: number) {
  return h('span', { class: 'swatch', style: { background: theme.def.playerColors[color % theme.def.playerColors.length] } });
}

export function bar(value: number, max: number, cls = '', target?: number) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  return h(
    'span',
    { class: `bar ${cls}` },
    h('span', { class: 'fill', style: { width: `${pct}%` } }),
    target !== undefined ? h('span', { class: 'target', style: { left: `${Math.min(100, (target / max) * 100)}%` } }) : null,
  );
}

/**
 * A reading in stars, each star a fifth of `max`, in half-star steps (rounded down, so a
 * full row means really there). With `slots`, only that many stars are drawn (in halves of
 * a star), e.g. the stars of a goal; otherwise five.
 */
export function stars(value: number, max = 100, slots?: number, cls = '') {
  const halves = Math.max(0, Math.floor((value / Math.max(1e-9, max)) * 10 + 1e-9));
  const slotHalves = Math.max(1, Math.round((slots ?? 5) * 2));
  const out: HTMLElement[] = [];
  for (let i = 0; i < slotHalves; i += 2) {
    const narrow = i + 1 === slotHalves; // a half-star slot at the end of the row
    const fill = halves >= i + 2 && !narrow ? 'full' : halves >= i + 1 ? 'half' : 'empty';
    out.push(h('span', { class: `star ${fill}${narrow ? ' narrow' : ''}` }));
  }
  return h('span', { class: `stars ${cls}` }, out);
}

/** Star count words for hover texts. */
export function starsText(value: number, max = 100): string {
  const n = Math.max(0, Math.min(5, Math.floor((value / Math.max(1e-9, max)) * 10 + 1e-9) / 2));
  return `${n} star${n === 1 ? '' : 's'}`;
}

export function statusView(content: Content, state: GameState, theme: Theme, p: PlayerState) {
  const statRows = content.stats
    .filter((s) => s.display !== 'hidden')
    .map((s) => {
      const v = p.stats[s.id] ?? 0;
      let value: HTMLElement | string;
      if (s.display === 'money') value = money(content, v);
      else if (s.display === 'bar') value = stars(v, statMaxFor(content, state, p, s.id) ?? 100);
      else {
        const max = statMaxFor(content, state, p, s.id);
        value = max !== undefined ? `${Math.floor(v * 10) / 10} / ${max}` : String(Math.round(v * 10) / 10);
      }
      return h('tr', { title: s.description ?? '' }, h('th', null, s.label), h('td', null, value));
    });

  const home = content.locationById.get(p.home)?.name ?? p.home;
  const job = p.job ? content.jobById.get(p.job) : null;
  const items = Object.entries(p.items)
    .filter(([, o]) => o.qty > 0)
    .map(([id, o]) => {
      const it = content.itemById.get(id);
      return h('li', { title: it?.description ?? '' }, `${it?.name ?? id}${o.qty > 1 ? ` ×${o.qty}` : ''}`);
    });
  const degrees = p.degrees.map((d) => h('li', null, content.degreeById.get(d)?.name ?? d));
  // The status notes that are not in the top bar (home, rest, fun, shares, raises, warnings…).
  const notes = hudIcons(content, state, p.id)
    .filter((i) => !i.bar)
    .sort((a, b) => Number(b.warn) - Number(a.warn))
    .map((i) => h('li', { class: i.warn ? 'bad' : i.dim ? 'muted' : '' }, h('span', { class: 'ico' }, i.icon), ' ', i.text));
  const courses = Object.entries(p.courses).map(([id, done]) => {
    const c = content.courseById.get(id);
    return h('li', null, `${c?.name ?? id}: ${done} lesson${done === 1 ? '' : 's'} done`);
  });

  return h(
    'div',
    { class: 'status' },
    h('h2', null, swatch(theme, p.color), ` ${p.name}`),
    h(
      'div',
      { class: 'cols' },
      h(
        'div',
        null,
        h('table', { class: 'kv' }, statRows),
        h(
          'table',
          { class: 'kv' },
          h('tr', null, h('th', null, 'Home'), h('td', null, home)),
          h('tr', null, h('th', null, 'Job'), h('td', null, job ? `${job.title} at ${content.locationById.get(job.location)?.name ?? job.location} (${money(content, jobWage(content, state, p))}/${content.game.timeUnit})` : 'Unemployed')),
        ),
        notes.length ? h('div', null, h('h3', null, 'Right now'), h('ul', { class: 'notes' }, notes)) : null,
      ),
      h(
        'div',
        null,
        h('h3', null, 'Belongings'),
        items.length ? h('ul', null, items) : h('p', { class: 'muted' }, 'Nothing much.'),
        h('h3', null, 'Education'),
        degrees.length || courses.length ? h('ul', null, degrees, courses) : h('p', { class: 'muted' }, 'No studies yet.'),
      ),
    ),
  );
}

/**
 * A goal as stars: one star is a fifth of the full scale, and the row has as many stars as
 * the target (half stars included), filled as the goal gets closer.
 */
export function goalStars(score: number, target: number) {
  const done = score >= target;
  return h(
    'span',
    { class: `goal-stars${done ? ' done' : ''}`, title: done ? 'Reached' : `${starsText(Math.min(score, target))} of ${starsText(target)}` },
    stars(Math.min(score, target), 100, target / 20),
    done ? h('b', null, ' ✓') : null,
  );
}

/**
 * The goal table. With `snapshots`, scores are each player's own reading from the start of
 * their latest week, shown as stars: you see how life is going, not what one choice did.
 * Without, exact bars (used on the game-over screen).
 */
export function goalsView(content: Content, state: GameState, theme: Theme, snapshots?: Map<string, Record<string, number>>) {
  const goals = content.goals.goals;
  return h(
    'div',
    { class: 'goals' },
    h('h2', null, 'Life goals'),
    h(
      'table',
      { class: 'goal-table' },
      h('tr', null, h('th', null, ''), goals.map((g) => h('th', { title: g.description ?? '' }, g.label))),
      state.players.map((p) => {
        const scores = snapshots?.get(p.id) ?? goalScores(content, state, p);
        return h(
          'tr',
          { class: p.id === state.players[state.current].id && state.phase === 'playing' ? 'current' : '' },
          h('th', null, swatch(theme, p.color), ` ${p.name}`),
          goals.map((g) => {
            const target = state.settings.goals[g.id];
            if (!snapshots) return h('td', null, bar(scores[g.id], 100, scores[g.id] >= target ? 'done' : '', target));
            return h('td', null, goalStars(scores[g.id], target));
          }),
        );
      }),
    ),
    h(
      'p',
      { class: 'muted small' },
      snapshots
        ? 'How each life feels at the start of the week: fill every star of your goals and keep them through the weekend to win. Nobody knows exactly where they stand.'
        : 'The marker shows each goal you set. Reach every marker and keep them through the weekend to win.',
    ),
  );
}

export function logView(state: GameState, log: LogEntry[], theme: Theme) {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const rows = [...log].reverse().map((e) => {
    const p = e.player ? byId.get(e.player) : undefined;
    return h('li', { class: e.tone }, h('span', { class: 'muted' }, `W${e.week} `), p ? swatch(theme, p.color) : null, p ? ` ${p.name}: ` : '', e.text);
  });
  return h('div', { class: 'log' }, h('h2', null, 'Village news'), rows.length ? h('ul', null, rows) : h('p', { class: 'muted' }, 'Nothing has happened yet.'));
}
