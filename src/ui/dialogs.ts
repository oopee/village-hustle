/** Read-only views: player status, goals overview, message log. */
import { goalScores, type Content, type GameState, type PlayerState } from '../engine';
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

export function statusView(content: Content, state: GameState, theme: Theme, p: PlayerState) {
  const statRows = content.stats
    .filter((s) => s.display !== 'hidden')
    .map((s) => {
      const v = p.stats[s.id] ?? 0;
      let value: HTMLElement | string;
      if (s.display === 'money') value = money(content, v);
      else if (s.display === 'bar') value = bar(v, statMaxFor(content, state, p, s.id) ?? 100, 'stat');
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
          h('tr', null, h('th', null, 'Job'), h('td', null, job ? `${job.title} (${money(content, jobWage(content, state, p))}/${content.game.timeUnit})` : 'Unemployed')),
        ),
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

export function goalsView(content: Content, state: GameState, theme: Theme) {
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
        const scores = goalScores(content, state, p);
        return h(
          'tr',
          { class: p.id === state.players[state.current].id && state.phase === 'playing' ? 'current' : '' },
          h('th', null, swatch(theme, p.color), ` ${p.name}`),
          goals.map((g) => {
            const target = state.settings.goals[g.id];
            const done = scores[g.id] >= target;
            return h('td', null, bar(scores[g.id], 100, done ? 'done' : '', target));
          }),
        );
      }),
    ),
    h('p', { class: 'muted small' }, 'The marker shows each goal you set. Reach every marker and keep them through the weekend to win.'),
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
