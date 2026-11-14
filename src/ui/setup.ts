/** New game setup: players (human / AI), life goals, rule randomization, seed. */
import type { Content, GameSetup, PlayerSetup } from '../engine';
import { clear, h, storageGet, storageSet } from './dom';
import type { Theme } from './theme';

const SETUP_KEY = 'village-hustle:setup';

interface SetupMemory {
  players: PlayerSetup[];
  goals: Record<string, number>;
  randomizeBalance: boolean;
}

export function setupView(content: Content, theme: Theme, onStart: (setup: GameSetup) => void, onBack: () => void): HTMLElement {
  const colors = theme.def.playerColors;
  const names = content.game.playerNames;
  const profiles = content.ai.profiles;
  const { min, max } = content.game.players;
  const nameFor = (i: number) => names[i % Math.max(1, names.length)] ?? `Player ${i + 1}`;

  const remembered = storageGet<SetupMemory | null>(SETUP_KEY, null);
  const players: PlayerSetup[] = remembered?.players?.length
    ? remembered.players.slice(0, max).map((p) => ({ ...p, color: p.color % colors.length }))
    : [
        { name: nameFor(0), color: 0, controller: 'human' },
        { name: nameFor(1), color: 1, controller: 'ai', aiProfile: profiles[0]?.id },
      ];
  while (players.length < Math.max(1, min)) players.push({ name: nameFor(players.length), color: players.length % colors.length, controller: 'human' });
  const goals: Record<string, number> = {};
  for (const g of content.goals.goals) goals[g.id] = remembered?.goals?.[g.id] ?? g.defaultTarget;
  let randomize = remembered?.randomizeBalance ?? true;
  let seed = '';

  const root = h('div', { class: 'setup' });
  const playerList = h('div', { class: 'players' });

  const freeColor = () => {
    for (let c = 0; c < colors.length; c++) if (!players.some((p) => p.color === c)) return c;
    return 0;
  };

  function renderPlayers() {
    clear(playerList);
    players.forEach((p, i) => {
      const colorBtn = h('button', {
        class: 'swatch-btn',
        title: 'Change colour',
        style: { background: colors[p.color] },
        onclick: () => {
          for (let k = 1; k <= colors.length; k++) {
            const c = (p.color + k) % colors.length;
            if (!players.some((o) => o !== p && o.color === c)) {
              p.color = c;
              break;
            }
          }
          renderPlayers();
        },
      });
      const name = h('input', { class: 'name', value: p.name, maxlength: 14, oninput: (e: Event) => (p.name = (e.target as HTMLInputElement).value) });
      const ctl = h(
        'select',
        {
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === 'human') {
              p.controller = 'human';
              delete p.aiProfile;
            } else {
              p.controller = 'ai';
              p.aiProfile = v.slice(3);
            }
          },
        },
        h('option', { value: 'human', selected: p.controller === 'human' }, 'Human'),
        profiles.map((pr) => h('option', { value: `ai:${pr.id}`, selected: p.controller === 'ai' && p.aiProfile === pr.id }, `AI: ${pr.name}`)),
      );
      const remove = h('button', {
        class: 'icon',
        title: 'Remove player',
        disabled: players.length <= min,
        onclick: () => {
          players.splice(i, 1);
          renderPlayers();
        },
      }, '✕');
      playerList.append(h('div', { class: 'player-row' }, colorBtn, name, ctl, remove));
    });
    if (players.length < max) {
      playerList.append(
        h('button', {
          class: 'add',
          onclick: () => {
            players.push({ name: nameFor(players.length), color: freeColor(), controller: 'ai', aiProfile: profiles[players.length % profiles.length]?.id });
            renderPlayers();
          },
        }, '+ Add player'),
      );
    }
  }
  renderPlayers();

  const { targetMin, targetMax } = content.goals;
  const goalRows = content.goals.goals.map((g) => {
    const out = h('span', { class: 'val' }, String(goals[g.id]));
    const input = h('input', {
      type: 'range',
      min: targetMin,
      max: targetMax,
      step: 5,
      value: goals[g.id],
      oninput: (e: Event) => {
        goals[g.id] = Number((e.target as HTMLInputElement).value);
        out.textContent = String(goals[g.id]);
      },
    });
    return h('label', { class: 'goal-row', title: g.description ?? '' }, h('span', { class: 'lbl' }, g.label), input, out);
  });

  const randomBox = h('input', { type: 'checkbox', checked: randomize, onchange: (e: Event) => (randomize = (e.target as HTMLInputElement).checked) });
  const seedInput = h('input', { class: 'seed', placeholder: 'random', maxlength: 24, oninput: (e: Event) => (seed = (e.target as HTMLInputElement).value) });

  root.append(
    h('h2', null, 'New game'),
    h(
      'div',
      { class: 'cols' },
      h('div', { class: 'col-players' }, h('h3', null, `Players (${min}-${max})`), playerList),
      h(
        'div',
        { class: 'col-goals' },
        h('h3', null, 'Life goals'),
        goalRows,
        h('p', { class: 'muted small' }, 'Higher goals mean a longer game.'),
        h('label', { class: 'check' }, randomBox, ' Shuffle the rules a little'),
        h('p', { class: 'muted small' }, 'Prices, wages and odds vary slightly every game, so nobody can learn exact numbers.'),
        h('label', { class: 'seed-row' }, 'Seed ', seedInput),
      ),
    ),
    h(
      'div',
      { class: 'buttons' },
      h('button', { onclick: onBack }, 'Back'),
      h('button', {
        class: 'primary',
        onclick: () => {
          players.forEach((p, i) => (p.name = p.name.trim() || nameFor(i)));
          storageSet(SETUP_KEY, { players, goals, randomizeBalance: randomize } satisfies SetupMemory);
          onStart({ players: players.map((p) => ({ ...p })), goals: { ...goals }, randomizeBalance: randomize, seed: seed.trim() || undefined });
        },
      }, 'Start game'),
    ),
  );
  return root;
}
