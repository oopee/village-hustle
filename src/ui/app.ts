/** The browser app: screens, HUD, location panel, event playback and the AI turn loop. */
import {
  ActionError,
  createGame,
  currentPlayer,
  goalScores,
  hudIcons,
  isLocationOpen,
  listOptions,
  locationAt,
  makeCtx,
  overallProgress,
  travelTime,
  type Action,
  type ActionOption,
  type Content,
  type GameEvent,
  type GameSetup,
  type PlayerState,
  type Tone,
} from '../engine';
import { chooseAction } from '../ai/bot';
import type { AudioPlayer } from '../audio/player';
import { clear, delay, h, storageGet, storageSet } from './dom';
import { bar, goalsView, logView, statusView, swatch } from './dialogs';
import { hours, money } from './format';
import { HostScene, type Mood } from './host-scene';
import { MapView } from './map-view';
import { clearSave, findSave, LocalSession } from './session';
import { SEASON_LABEL, seasonOfWeek } from './season';
import { setupView } from './setup';
import type { Theme } from './theme';

const SPEEDS = {
  slow: { think: 900, walk: 110, handoff: 2400 },
  normal: { think: 420, walk: 200, handoff: 1400 },
  fast: { think: 90, walk: 520, handoff: 500 },
  instant: { think: 0, walk: 0, handoff: 0 },
} as const;
type Speed = keyof typeof SPEEDS;
const SPEED_KEY = 'village-hustle:aiSpeed';

interface Msg {
  text: string;
  tone: Tone;
}

/** An action that just happened at a location, collected so the host can react to it. */
interface Pending {
  loc: string;
  action: string;
  option?: string;
  label: string;
  msgs: Msg[];
  said: Msg[];
}

const pick = <T>(list: T[] | undefined): T | undefined => (list?.length ? list[Math.floor(Math.random() * list.length)] : undefined);

interface Modal {
  el: HTMLElement;
  closable: boolean;
  close: () => void;
}

export class App {
  readonly map: MapView;
  readonly ui: HTMLElement;
  private hud: HTMLElement;
  private panel: HTMLElement;
  private tooltip: HTMLElement;
  private toast: HTMLElement;
  private modalLayer: HTMLElement;
  private modals: Modal[] = [];

  session: LocalSession | null = null;
  private busy = false;
  private aiRunning = false;
  /** Incremented whenever a game is left, so stale async loops stop. */
  private gen = 0;
  private panelLoc: string | null = null;
  private panelMsgs: Msg[] = [];
  /** Open submenu path inside the location panel: [] = top, [group] or [group, sub]. */
  private menu: string[] = [];
  private greeting = '';
  private speed: Speed = storageGet<Speed>(SPEED_KEY, 'normal');
  private toastTimer = 0;
  private scene: HostScene;

  constructor(
    readonly content: Content,
    readonly theme: Theme,
    stage: HTMLElement,
    readonly audio: AudioPlayer,
  ) {
    const canvas = h('canvas', { class: 'map' });
    this.ui = h('div', { class: 'ui' });
    this.hud = h('div', { class: 'hud hidden' });
    this.panel = h('div', { class: 'panel location hidden' });
    this.tooltip = h('div', { class: 'tooltip hidden' });
    this.toast = h('div', { class: 'toast hidden' });
    this.modalLayer = h('div', { class: 'modal-layer' });
    this.ui.append(this.hud, this.panel, this.tooltip, this.toast, this.modalLayer);
    stage.append(canvas, this.ui);
    if (!(SPEEDS as Record<string, unknown>)[this.speed]) this.speed = 'normal';

    this.scene = new HostScene(theme);
    this.scene.onType = (text, from, to, voice) => voice && audio.babble(voice, text, from, to);
    this.scene.pokeable = (id) => !!(this.panelLoc && this.content.locationById.get(this.panelLoc)?.pokes[id]);
    this.scene.onPoke = (id) => this.poke(id);
    this.map = new MapView(canvas, theme, content);
    this.map.onStep = () => audio.cue('walk.step');
    this.map.onHover = (id, x, y) => {
      if (id && id !== this.map.hover) audio.prefetch(id);
      this.showTooltip(id, x, y);
    };
    // A soft click for ordinary buttons (choices at a location make their own sounds).
    this.ui.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest?.('button');
      if (b && !b.classList.contains('opt') && !(b as HTMLButtonElement).disabled) audio.cue('ui.click');
    }, true);
    this.map.onClick = (id) => this.onMapClick(id);

    window.addEventListener('keydown', (e) => this.onKey(e));
    if (theme.warnings.length) console.warn('Theme warnings:\n' + theme.warnings.join('\n'));
  }

  // ------------------------------------------------------------------ modals

  private openModal(content: HTMLElement, opts: { closable?: boolean; cls?: string; onClose?: () => void } = {}): Modal {
    const closable = opts.closable ?? true;
    const box = h('div', { class: `modal ${opts.cls ?? ''}` }, content);
    if (closable) box.prepend(h('button', { class: 'icon close', title: 'Close (Esc)', onclick: () => modal.close() }, '✕'));
    const backdrop = h('div', {
      class: 'backdrop',
      onpointerdown: (e: Event) => {
        if (closable && e.target === backdrop) modal.close();
      },
    }, box);
    const modal: Modal = {
      el: backdrop,
      closable,
      close: () => {
        const i = this.modals.indexOf(modal);
        if (i < 0) return;
        this.modals.splice(i, 1);
        backdrop.remove();
        opts.onClose?.();
        // Computer players wait while a dialog is open at the start of their turn.
        queueMicrotask(() => this.maybeRunAi());
      },
    };
    this.modals.push(modal);
    this.modalLayer.append(backdrop);
    return modal;
  }

  private closeAllModals() {
    for (const m of [...this.modals]) {
      this.modals.splice(this.modals.indexOf(m), 1);
      m.el.remove();
    }
  }

  /** A yes/no dialog. `warnings` are shown under the question in the "bad" colour. */
  private confirm(text: string, yes = 'Yes', no = 'No', warnings: string[] = []): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v: boolean) => {
        if (answered) return;
        answered = true;
        m.close();
        resolve(v);
      };
      const m = this.openModal(
        h('div', { class: 'confirm' }, h('p', null, text), warnings.map((w) => h('p', { class: 'bad' }, w)), h('div', { class: 'buttons' }, h('button', { onclick: () => done(false) }, no), h('button', { class: 'primary', onclick: () => done(true) }, yes))),
        { onClose: () => done(false), cls: 'small' },
      );
    });
  }

  private onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.toggleSound();
      return;
    }
    if (e.key === 'Escape') {
      const top = this.modals[this.modals.length - 1];
      if (top?.closable) top.close();
      else if (!top && this.panelLoc && this.isHumanTurn()) {
        if (this.menu.length) {
          this.menu.pop();
          this.render();
        } else this.closePanel();
      }
    }
  }

  private flash(text: string, tone: Tone = 'info') {
    this.toast.textContent = text;
    this.toast.className = `toast ${tone}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.add('hidden'), 2600);
  }

  // ------------------------------------------------------------------ screens

  private toggleSound() {
    const muted = this.audio.toggleMute();
    this.flash(muted ? 'Sound off (M to turn it back on)' : 'Sound on', 'info');
    this.render();
  }

  showTitle() {
    this.leaveGame();
    this.audio.music('title');
    const save = findSave(this.content);
    const g = this.content.game;
    const buttons = h('div', { class: 'title-buttons' });
    if (save.kind === 'ok') {
      buttons.append(
        h('button', {
          class: 'primary',
          onclick: () => {
            m.close();
            void this.resume(save.session);
          },
        }, 'Continue'),
      );
    }
    buttons.append(
      h('button', { class: save.kind === 'ok' ? '' : 'primary', onclick: () => (m.close(), this.showSetup()) }, 'New game'),
      h('button', { onclick: () => this.showHowTo() }, 'How to play'),
    );
    const m = this.openModal(
      h(
        'div',
        { class: 'title' },
        h('h1', null, g.title),
        g.subtitle ? h('p', { class: 'subtitle' }, g.subtitle) : null,
        buttons,
        save.kind === 'outdated' ? h('p', { class: 'muted small' }, 'A saved game was found, but the game rules have changed since, so it cannot be continued.') : null,
      ),
      { closable: false, cls: 'title-screen' },
    );
  }

  showHowTo() {
    const intro = this.content.game.intro;
    this.openModal(
      h(
        'div',
        { class: 'howto' },
        h('h2', null, 'How to play'),
        intro.map((p) => h('p', null, p)),
        h('h3', null, 'Controls'),
        h(
          'ul',
          null,
          h('li', null, 'Click a building to walk there. Walking takes time.'),
          h('li', null, 'Inside, pick what to do. Greyed-out choices tell you why when clicked.'),
          h('li', null, 'When your hours run out, finish up where you are and step outside: you hurry home for the weekend. Or press End week.'),
          h('li', null, 'The icons in the top bar show your home, food, rent, clothes and how your week has gone so far. Hover them for details.'),
          h('li', null, 'Status and Goals show how you are doing. News lists everything that has happened.'),
          h('li', null, 'Press M to turn the sound on or off; volumes are in the Menu.'),
        ),
      ),
      { cls: 'wide' },
    );
  }

  showSetup() {
    const m = this.openModal(
      setupView(
        this.content,
        this.theme,
        (setup) => {
          m.close();
          this.startNew(setup);
        },
        () => {
          m.close();
          this.showTitle();
        },
      ),
      { closable: false, cls: 'wide' },
    );
  }

  private showError(title: string, err: unknown) {
    this.openModal(h('div', null, h('h2', null, title), h('pre', { class: 'error' }, String((err as Error)?.message ?? err))), { cls: 'wide' });
  }

  startNew(setup: GameSetup) {
    this.leaveGame();
    let created;
    try {
      created = createGame(this.content, setup);
    } catch (e) {
      this.showError('Could not start the game', e);
      this.showTitle();
      return;
    }
    this.session = new LocalSession(this.content, created.state);
    this.session.record(created.events);
    void this.playEvents(created.events, this.gen).then(() => this.maybeRunAi());
  }

  async resume(session: LocalSession) {
    this.leaveGame();
    this.session = session;
    const gen = this.gen;
    const p = currentPlayer(session.state);
    this.render();
    await this.handoff(null, [], [{ text: 'Game loaded.', tone: 'info' }], gen);
    if (gen !== this.gen) return;
    this.beginTurnView(p);
    this.maybeRunAi();
  }

  leaveGame() {
    this.gen++;
    this.closeAllModals();
    this.goalSnaps.clear();
    this.session = null;
    this.busy = false;
    this.aiRunning = false;
    this.panelLoc = null;
    this.map.setToken(null);
    this.render();
  }

  // ------------------------------------------------------------------ game flow helpers

  private get state() {
    return this.session!.state;
  }

  private me(): PlayerState | null {
    return this.session ? currentPlayer(this.session.state) : null;
  }

  private isHumanTurn(): boolean {
    const p = this.me();
    return !!p && p.controller === 'human' && this.state.phase === 'playing';
  }

  private onMapClick(locId: string) {
    const p = this.me();
    if (!p || !this.isHumanTurn() || this.busy || this.modals.length) return;
    const loc = this.content.locationById.get(locId);
    if (!loc) return;
    if (p.timeLeft <= 0) {
      void this.endWeek();
      return;
    }
    if (p.node === loc.node) {
      this.openPanel(loc.id);
      return;
    }
    const t = travelTime(this.content, this.state, p, loc.node);
    if (t > p.timeLeft) {
      this.flash(`Walking to ${loc.name} takes ${hours(this.content, t)}. You only have ${hours(this.content, p.timeLeft)} left.`, 'bad');
      return;
    }
    void this.act({ type: 'move', player: p.id, to: loc.node });
  }

  private showTooltip(id: string | null, x: number, y: number) {
    const p = this.me();
    if (!id || !p || this.modals.length) {
      this.tooltip.classList.add('hidden');
      return;
    }
    const loc = this.content.locationById.get(id)!;
    const here = p.node === loc.node;
    const t = here ? 0 : travelTime(this.content, this.state, p, loc.node);
    const open = isLocationOpen(this.content, this.state, p, loc);
    clear(this.tooltip);
    this.tooltip.append(
      h('b', null, loc.name),
      h('span', { class: t > p.timeLeft ? 'bad' : 'muted' }, here ? 'You are here' : `${hours(this.content, t)} walk`),
    );
    if (!open) this.tooltip.append(h('span', { class: 'bad' }, 'Closed'));
    this.tooltip.classList.remove('hidden');
    const W = this.theme.def.width;
    const H = this.theme.def.height;
    const tx = Math.min(W - 110, Math.max(4, x + 10));
    const ty = y > H - 50 ? y - 40 : y + 14;
    this.tooltip.style.left = `${tx}px`;
    this.tooltip.style.top = `${ty}px`;
  }

  /** Submits an action and plays back the resulting events. */
  private async act(action: Action): Promise<void> {
    if (!this.session || this.busy) return;
    const gen = this.gen;
    this.busy = true;
    this.render();
    try {
      let events: GameEvent[];
      try {
        events = await this.session.submit(action);
      } catch (e) {
        if (e instanceof ActionError) {
          this.flash(e.message, 'bad');
          return;
        }
        throw e;
      }
      if (action.type === 'do') this.panelMsgs = [];
      await this.playEvents(events, gen);
    } catch (e) {
      console.error(e);
      this.showError('Something went wrong', e);
    } finally {
      if (gen === this.gen) {
        this.busy = false;
        this.render();
      }
    }
    if (gen === this.gen) this.maybeRunAi();
  }

  /** Animates and displays a batch of engine events. */
  private async playEvents(events: GameEvent[], gen: number): Promise<void> {
    const before: Msg[] = [];
    const after: Msg[] = [];
    let endedPlayer: string | null = null;
    let started: string | null = null;
    let newWeek = false;
    let gameOver: Extract<GameEvent, { type: 'gameOver' }> | null = null;
    const sp = SPEEDS[this.speed];
    let pending: Pending | null = null;
    const flush = () => {
      if (pending && pending.loc === this.panelLoc) this.hostReact(pending);
      pending = null;
    };

    for (const e of events) {
      if (gen !== this.gen) return;
      switch (e.type) {
        case 'moved': {
          flush();
          const p = this.state.players.find((x) => x.id === e.player)!;
          const dest = locationAt(this.content, e.path[e.path.length - 1]);
          if (dest) this.audio.prefetch(dest.id);
          this.audio.music('map');
          if (!this.map.token) this.map.setToken(p.color, e.path[0]);
          this.panelLoc = null;
          this.tooltip.classList.add('hidden');
          this.render();
          const humanWalk = p.controller === 'human' ? SPEEDS.normal.walk * 1.3 : sp.walk;
          await this.map.walk(e.path, humanWalk);
          if (gen !== this.gen) return;
          const loc = locationAt(this.content, e.path[e.path.length - 1]);
          this.openPanel(loc?.id ?? null);
          break;
        }
        case 'did': {
          flush();
          const p = this.state.players.find((x) => x.id === e.player);
          if (p?.controller === 'ai') this.panelMsgs.push({ text: `${p.name}: ${e.label}`, tone: 'info' });
          pending = { loc: e.location, action: e.action, option: e.option, label: e.label, msgs: [], said: [] };
          break;
        }
        case 'message': {
          const m = { text: e.text, tone: e.tone };
          const hostName = e.speaker === 'host' && this.panelLoc ? this.content.locationById.get(this.panelLoc)?.host?.name : undefined;
          if (started) after.push(hostName ? { ...m, text: `${hostName}: "${m.text}"` } : m);
          else {
            before.push(hostName ? { ...m, text: `${hostName}: "${m.text}"` } : m);
            if (e.speaker === 'host') {
              if (pending) pending.said.push(m);
              else this.scene.say(m.text, this.moodOf([m]));
            } else {
              this.panelMsgs.push(m);
              pending?.msgs.push(m);
            }
          }
          break;
        }
        case 'turnEnded': {
          flush();
          endedPlayer = e.player;
          // Out of time: a quick dash home before the next player's turn.
          const p = this.state.players.find((x) => x.id === e.player);
          if (p && e.path.length > 1 && sp.walk > 0) {
            this.panelLoc = null;
            this.tooltip.classList.add('hidden');
            this.map.setToken(p.color, e.path[0]);
            this.audio.music('map');
            this.render();
            await this.map.walk(e.path, Math.max(sp.walk, SPEEDS.fast.walk) * 1.6);
            if (gen !== this.gen) return;
          }
          break;
        }
        case 'turnStarted':
          started = e.player;
          break;
        case 'weekEnded':
          newWeek = true;
          break;
        case 'gameOver':
          gameOver = e;
          break;
        default:
          break;
      }
      this.render();
    }
    flush();

    if (gameOver) {
      await delay(400);
      if (gen === this.gen) this.showGameOver();
      return;
    }
    if (started) {
      const ended = endedPlayer ? this.state.players.find((p) => p.id === endedPlayer) ?? null : null;
      await this.handoff(ended, before, after, gen, newWeek);
      if (gen !== this.gen) return;
      this.beginTurnView(currentPlayer(this.state));
    }
  }

  /** Shows "next player" screen. Humans click to start; AI turns continue automatically. */
  private handoff(prev: PlayerState | null, prevMsgs: Msg[], msgs: Msg[], gen: number, newWeek = false): Promise<void> {
    const p = currentPlayer(this.state);
    this.panelLoc = null;
    this.map.setToken(null);
    this.render();
    this.audio.music('map');
    this.audio.cue(newWeek ? 'week.new' : 'turn.start');
    if (msgs.some((x) => x.tone === 'bad')) this.audio.cue('msg.bad', 1.2);
    else if (msgs.some((x) => x.tone === 'good')) this.audio.cue('msg.good', 1.2);
    const ai = p.controller === 'ai';
    const sp = SPEEDS[this.speed];
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onKey);
        m.close();
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          finish();
        }
      };
      const list = (items: Msg[]) => h('ul', { class: 'msgs' }, items.map((x) => h('li', { class: x.tone }, x.text)));
      const content = h(
        'div',
        { class: 'handoff' },
        prev && prevMsgs.length ? h('div', { class: 'prev' }, h('h3', null, swatch(this.theme, prev.color), ` ${prev.name}'s week is over`), list(prevMsgs)) : null,
        h('h2', null, `Week ${this.state.week}`),
        h('div', { class: 'who' }, swatch(this.theme, p.color), h('span', null, ` ${p.name}'s turn`), ai ? h('span', { class: 'muted' }, ` (computer)`) : null),
        msgs.length ? list(msgs) : h('p', { class: 'muted' }, 'A quiet week.'),
        h('div', { class: 'buttons' }, h('button', { class: 'primary', onclick: finish }, ai ? 'Continue' : 'Start my week')),
      );
      const m = this.openModal(content, { closable: false, cls: 'handoff-modal' });
      window.addEventListener('keydown', onKey);
      if (ai) {
        const wait = sp.handoff + (msgs.length ? sp.handoff * 0.6 : 0);
        void delay(wait).then(() => {
          if (gen === this.gen) finish();
        });
      }
    });
  }

  /** Each player's goal scores as of the start of their latest week (see goalsView). */
  private goalSnaps = new Map<string, Record<string, number>>();

  private snapGoals(p: PlayerState): Record<string, number> {
    let s = this.goalSnaps.get(p.id);
    if (!s) {
      s = goalScores(this.content, this.state, p);
      this.goalSnaps.set(p.id, s);
    }
    return s;
  }

  private beginTurnView(p: PlayerState) {
    this.goalSnaps.set(p.id, goalScores(this.content, this.state, p));
    this.map.setToken(p.color, p.node);
    this.panelMsgs = [];
    const loc = locationAt(this.content, p.node);
    this.openPanel(loc?.id ?? null);
  }

  private maybeRunAi() {
    if (this.aiRunning || this.busy || !this.session) return;
    const p = this.me();
    if (!p || p.controller !== 'ai' || this.state.phase !== 'playing' || this.modals.length) return;
    void this.runAi();
  }

  private async runAi() {
    const gen = this.gen;
    this.aiRunning = true;
    let guard = 0;
    try {
      while (gen === this.gen && this.session && this.state.phase === 'playing') {
        const p = this.me()!;
        if (p.controller !== 'ai') break;
        await delay(SPEEDS[this.speed].think);
        if (gen !== this.gen) return;
        let action: Action;
        try {
          action = chooseAction(this.content, this.state, Math.random).action;
        } catch (e) {
          console.error('AI failed to choose an action', e);
          action = { type: 'endTurn', player: p.id };
        }
        const before = this.state;
        await this.act(action);
        if (this.session && this.state === before) {
          // The action was rejected; make sure the AI cannot get stuck.
          if (++guard > 3) await this.act({ type: 'endTurn', player: p.id });
        } else guard = 0;
      }
    } finally {
      if (gen === this.gen) this.aiRunning = false;
    }
  }

  private async endWeek() {
    const p = this.me();
    if (!p || !this.isHumanTurn() || this.busy) return;
    if (p.timeLeft > 0 && !(await this.confirm(`End your week with ${hours(this.content, p.timeLeft)} left?`, 'End week', 'Keep playing'))) return;
    void this.act({ type: 'endTurn', player: p.id });
  }

  private outOfTime(): boolean {
    const p = this.me();
    return !!p && this.isHumanTurn() && p.timeLeft <= 0;
  }

  private showGameOver() {
    const s = this.state;
    const winner = s.players.find((p) => p.id === s.winner);
    this.panelLoc = null;
    this.map.setToken(null);
    clearSave();
    this.render();
    this.audio.music('gameover');
    this.audio.cue('game.over');
    const ranked = [...s.players].sort((a, b) => overallProgress(this.content, s, b) - overallProgress(this.content, s, a));
    this.openModal(
      h(
        'div',
        { class: 'gameover' },
        h('h1', null, winner ? `${winner.name} wins!` : 'Game over'),
        h('p', null, s.endReason === 'goals' ? `${winner?.name} kept every life goal through week ${s.week}.` : `The years went by. ${winner?.name ?? 'Nobody'} got closest to their goals.`),
        goalsView(this.content, s, this.theme),
        h('p', { class: 'small muted' }, 'Final order: ', ranked.map((p, i) => `${i + 1}. ${p.name}`).join('   ')),
        h('div', { class: 'buttons' }, h('button', { class: 'primary', onclick: () => this.showTitle() }, 'Back to title')),
      ),
      { closable: false, cls: 'wide' },
    );
  }

  // ------------------------------------------------------------------ panel

  private openPanel(locId: string | null) {
    if (locId !== this.panelLoc) {
      this.menu = [];
      const loc = locId ? this.content.locationById.get(locId) : null;
      this.greeting = pick(loc?.greeting) ?? '';
      this.panelMsgs = [];
      this.scene.setLocation(locId, loc?.name ?? '', loc?.host?.name ?? '', this.furnitureAt(locId));
      if (locId) {
        this.audio.prepareVoice(locId);
        for (const [id, pk] of Object.entries(loc?.pokes ?? {})) if (pk.name) this.audio.prepareVoice(id);
        this.audio.cue(`enter.${locId}`);
      }
      this.audio.music(locId ?? 'map');
      const hello = pick(loc?.host?.lines.hello);
      if (hello) this.scene.say(hello);
    }
    this.panelLoc = locId;
    this.render();
  }

  /** The things to show in a room: the current player's own items, if it is their home. */
  private furnitureAt(locId: string | null): string[] {
    const p = this.me();
    return p && locId && p.home === locId ? Object.keys(p.items) : [];
  }

  /** Something in the room was clicked: the cat, a clock, a regular... Pure flavour. */
  private poke(id: string) {
    const locId = this.panelLoc;
    const pk = locId ? this.content.locationById.get(locId)?.pokes[id] : undefined;
    if (!locId || !pk) return;
    const line = pick(pk.lines);
    if (!line) return;
    this.audio.cue(`poke.${locId}.${id}`);
    this.scene.sayAt(id, line, pk.name);
  }

  private moodOf(msgs: Msg[]): Mood {
    if (msgs.some((m) => m.tone === 'bad')) return 'annoyed';
    if (msgs.some((m) => m.tone === 'good')) return 'happy';
    return 'neutral';
  }

  /** What kind of thing just happened (for host lines and sounds): buy, work, hired, graduate... */
  private reactionOf(pd: Pending, mood: Mood): { kind?: string; cat?: string } {
    const loc = this.content.locationById.get(pd.loc);
    const kind = loc?.actions.find((a) => a.id === pd.action)?.kind;
    let cat: string | undefined;
    switch (kind) {
      case 'shop':
        cat = 'buy';
        break;
      case 'work':
        cat = 'work';
        break;
      case 'jobs':
        cat = mood === 'annoyed' ? 'rejected' : 'hired';
        break;
      case 'courses':
        cat = /^enrol/i.test(pd.label) ? 'enroll' : mood === 'happy' ? 'graduate' : 'lesson';
        break;
      case 'sell':
        cat = 'sell';
        break;
      case 'transfer':
        cat = 'money';
        break;
      default:
        break;
    }
    return { kind, cat };
  }

  /** The action's sound: the most specific match in the theme's audio.json. */
  private actionSound(pd: Pending) {
    const mood = this.moodOf([...pd.said, ...pd.msgs]);
    const { kind, cat } = this.reactionOf(pd, mood);
    const special = cat === 'hired' || cat === 'rejected' || cat === 'graduate' || cat === 'enroll' || cat === 'lesson';
    this.audio.action({
      loc: pd.loc,
      action: pd.action,
      option: pd.option,
      category: pd.option ? this.content.itemById.get(pd.option)?.category : undefined,
      kind,
      outcome: special ? cat : mood === 'happy' ? 'good' : mood === 'annoyed' ? 'bad' : undefined,
    });
  }

  /** The owner reacts to an action done at their location: a line from content, or a wordless mood. */
  private hostReact(pd: Pending) {
    this.actionSound(pd);
    const loc = this.content.locationById.get(pd.loc);
    const host = loc?.host;
    if (pd.said.length) {
      this.scene.say(pd.said.map((m) => m.text).join(' '), this.moodOf([...pd.said, ...pd.msgs]));
      return;
    }
    const mood = this.moodOf(pd.msgs);
    // Done with a regular (a pint with Pekki...): they chat and react, the host stays out of it.
    if (this.scene.reactExtra(pd.action, mood)) return;
    if (!host) return this.scene.react(mood);
    const { cat } = this.reactionOf(pd, mood);
    // Most specific first: the bought item or chosen option, then the action, then the kind of reaction.
    const line =
      (pd.option ? pick(host.lines[pd.option]) : undefined) ?? pick(host.lines[pd.action]) ?? (cat ? pick(host.lines[cat]) : undefined);
    if (line) this.scene.say(line, mood);
    else this.scene.react(mood);
  }

  private closePanel() {
    // Out of hours: stepping outside means heading home for the weekend.
    if (this.outOfTime() && !this.busy) {
      void this.endWeek();
      return;
    }
    this.panelLoc = null;
    this.audio.music('map');
    this.render();
  }

  private renderPanel() {
    const p = this.me();
    const loc = this.panelLoc ? this.content.locationById.get(this.panelLoc) : null;
    if (!p || !loc || p.node !== loc.node || this.state.phase !== 'playing') {
      this.panel.classList.add('hidden');
      return;
    }
    const locked = !this.isHumanTurn() || this.busy;
    clear(this.panel);
    this.panel.classList.remove('hidden');
    this.panel.classList.toggle('locked', locked);
    const open = isLocationOpen(this.content, this.state, p, loc);

    const msgs = this.panelMsgs.length ? this.panelMsgs.slice(-4) : this.greeting ? [{ text: this.greeting, tone: 'info' as Tone }] : [];
    const captions = h('div', { class: 'captions' }, msgs.map((m) => h('p', { class: m.tone }, m.text)));
    const left = h(
      'div',
      { class: 'left' },
      this.scene.el,
      captions,
      loc.host ? h('p', { class: 'host-name' }, h('b', null, loc.host.name), loc.host.title ? ` · ${loc.host.title}` : '') : null,
      h('p', { class: 'desc' }, loc.description),
    );

    const right = h('div', { class: 'options' });
    if (!open) right.append(h('p', { class: 'closed' }, loc.closedText ?? `${loc.name} is closed.`));
    else {
      const opts = listOptions(this.content, this.state, p.id);
      if (!opts.length) right.append(h('p', { class: 'muted' }, 'Nothing to do here right now.'));
      else right.append(...this.renderMenu(opts, locked));
    }

    this.panel.append(
      h(
        'div',
        { class: 'head' },
        h('span', { class: 'name' }, loc.name),
        h('button', { class: 'icon', title: 'Step outside (Esc)', onclick: () => this.closePanel(), disabled: locked }, '✕'),
      ),
      h('div', { class: 'body' }, left, right),
    );
    this.scene.setFurniture(this.furnitureAt(loc.id));
    this.scene.attached();
    captions.scrollTop = captions.scrollHeight;
  }

  /**
   * The location's actions as nested menus, at most two levels deep:
   * top level = single actions plus one entry per group (shop, courses, vacancies...);
   * job vacancies get a second level by workplace.
   */
  private renderMenu(opts: ActionOption[], locked: boolean): HTMLElement[] {
    type Group = { key: string; title: string; items: ActionOption[] };
    const groups: Group[] = [];
    const top: (ActionOption | Group)[] = [];
    for (const o of opts) {
      if (o.kind === 'basic' || o.kind === 'work') {
        top.push(o);
        continue;
      }
      let g = groups.find((x) => x.key === o.action);
      if (!g) {
        g = { key: o.action, title: o.group, items: [] };
        groups.push(g);
        top.push(g);
      }
      g.items.push(o);
    }
    const isGroup = (x: ActionOption | Group): x is Group => 'items' in x;
    const jobPlace = (o: ActionOption) => {
      const job = o.option ? this.content.jobById.get(o.option) : undefined;
      return job ? (this.content.locationById.get(job.location)?.name ?? job.location) : '';
    };
    const back = (title: string) => [
      h(
        'button',
        { class: 'opt back', disabled: locked, onclick: () => (this.menu.pop(), this.render()) },
        h('span', { class: 'lbl' }, `‹ ${title}`),
        h('span', { class: 'meta' }, 'Back'),
      ),
    ];
    const submenuButton = (label: string, count: number, open: () => void) =>
      h(
        'button',
        { class: 'opt sub', disabled: locked, onclick: () => (open(), this.render()) },
        h('span', { class: 'lbl' }, label),
        h('span', { class: 'meta' }, `${count} ›`),
      );

    const [gKey, sub] = this.menu;
    const group = gKey ? groups.find((g) => g.key === gKey) : undefined;
    if (gKey && !group) this.menu = []; // the group vanished (e.g. after quitting a job)

    if (!group) {
      return top.map((x) =>
        isGroup(x) ? submenuButton(x.title, x.items.length, () => (this.menu = [x.key])) : this.optionButton(x),
      );
    }

    const isJobs = group.items[0]?.kind === 'jobs';
    if (isJobs && sub === undefined) {
      const places = [...new Set(group.items.map(jobPlace))];
      return [
        ...back(group.title),
        ...places.map((place) =>
          submenuButton(place, group.items.filter((o) => jobPlace(o) === place).length, () => (this.menu = [group.key, place])),
        ),
      ];
    }
    const items = isJobs ? group.items.filter((o) => jobPlace(o) === sub) : group.items;
    return [
      ...back(isJobs ? `${group.title}: ${sub}` : group.title),
      ...items.map((o) => this.optionButton(isJobs ? { ...o, label: o.label.replace(/ — .*$/, '') } : o)),
    ];
  }

  private optionButton(o: ActionOption): HTMLElement {
    const meta: string[] = [];
    if (o.detail) meta.push(o.detail);
    if (o.time > 0) meta.push(hours(this.content, o.time));
    if (o.cost > 0) meta.push(money(this.content, o.cost));
    return h(
      'button',
      {
        class: `opt ${o.enabled ? '' : 'off'}`,
        title: o.enabled ? (o.description ?? '') : o.reasons.join(' '),
        onclick: () => {
          const p = this.me();
          if (!p || !this.isHumanTurn() || this.busy) return;
          if (!o.enabled) {
            this.audio.cue('ui.denied');
            this.panelMsgs = o.reasons.map((r) => ({ text: r, tone: 'bad' as Tone }));
            const lines = this.panelLoc ? this.content.locationById.get(this.panelLoc)?.host?.lines : undefined;
            const broke = o.reasons.some((r) => /money|afford|cash|€/i.test(r));
            const line = pick(broke ? lines?.broke ?? lines?.refuse : lines?.refuse);
            if (line) this.scene.say(line, 'annoyed');
            else this.scene.react('annoyed');
            this.render();
            return;
          }
          void this.act({ type: 'do', player: p.id, action: o.action, option: o.option });
        },
      },
      h('span', { class: 'lbl' }, o.label),
      meta.length ? h('span', { class: 'meta' }, meta.join(' · ')) : null,
    );
  }

  // ------------------------------------------------------------------ HUD

  private renderHud() {
    const p = this.me();
    if (!p || !this.session || this.state.phase !== 'playing') {
      this.hud.classList.add('hidden');
      this.map.daylight = 1;
      return;
    }
    this.hud.classList.remove('hidden');
    clear(this.hud);
    const full = Math.max(1, makeCtx(this.content, this.state, p, []).num(this.content.game.turnTime));
    const season = seasonOfWeek(this.state.week);
    this.map.season = season;
    this.map.daylight = Math.min(1, p.timeLeft / full);
    const human = this.isHumanTurn();
    const profile = p.controller === 'ai' ? this.content.ai.profiles.find((x) => x.id === p.aiProfile)?.name ?? 'Computer' : null;
    const scores = this.snapGoals(p);
    const goalsDone = this.content.goals.goals.filter((g) => scores[g.id] >= this.state.settings.goals[g.id]).length;
    const icons = hudIcons(this.content, this.state, p.id);
    this.hud.append(
      h('div', { class: 'who' }, swatch(this.theme, p.color), h('div', null, h('b', null, p.name), h('small', null, `Week ${this.state.week} · ${SEASON_LABEL[season]}${profile ? ` · AI ${profile}` : ''}`))),
      h('div', { class: 'clock', title: 'Time left this week' }, h('small', null, 'Time'), bar(p.timeLeft, full, 'time'), h('b', null, hours(this.content, p.timeLeft))),
      h('div', { class: 'cash', title: 'Cash in hand' }, h('small', null, 'Cash'), h('b', null, money(this.content, p.stats.money ?? 0))),
      h('div', { class: 'goalsmini', title: 'Goals reached' }, h('small', null, 'Goals'), h('b', null, `${goalsDone}/${this.content.goals.goals.length}`)),
      h(
        'div',
        { class: 'hudicons' },
        icons.map((i) =>
          h(
            'span',
            { class: `hudicon${i.warn ? ' warn' : ''}${i.dim ? ' dim' : ''}`, title: i.text, onclick: () => this.flash(i.text, i.warn ? 'bad' : 'info') },
            i.icon,
            i.badge ? h('i', null, String(i.badge)) : null,
          ),
        ),
      ),
      h(
        'div',
        { class: 'btns' },
        h('button', { onclick: () => this.openModal(statusTabs(this), { cls: 'wide' }) }, 'Status'),
        h('button', {
          onclick: () => {
            for (const pl of this.state.players) this.snapGoals(pl);
            this.openModal(goalsView(this.content, this.state, this.theme, this.goalSnaps), { cls: 'wide' });
          },
        }, 'Goals'),
        h('button', { onclick: () => this.openModal(logView(this.state, this.session!.log, this.theme), { cls: 'wide' }) }, 'News'),
        h('button', { class: `sound${this.audio.volumes().muted ? ' off' : ''}`, title: 'Sound on/off (M)', onclick: () => this.toggleSound() }, '♪'),
        h('button', { onclick: () => this.showMenu() }, 'Menu'),
        h('button', { class: 'primary', disabled: !human || this.busy, onclick: () => void this.endWeek() }, 'End week'),
      ),
    );
  }

  /** Volume sliders for music, effects and voices, plus a mute switch. */
  private soundControls(): HTMLElement {
    const v = this.audio.volumes();
    const slider = (label: string, key: 'music' | 'sfx' | 'voice', test?: () => void) =>
      h(
        'label',
        { class: 'vol' },
        h('span', null, label),
        h('input', {
          type: 'range',
          min: '0',
          max: '100',
          value: String(Math.round(v[key] * 100)),
          oninput: (e: Event) => this.audio.setVolumes({ [key]: Number((e.target as HTMLInputElement).value) / 100 }),
          onchange: () => test?.(),
        }),
      );
    const mute = h('button', {
      class: v.muted ? '' : 'primary',
      onclick: () => {
        this.toggleSound();
        mute.className = this.audio.volumes().muted ? '' : 'primary';
        mute.textContent = this.audio.volumes().muted ? 'Sound is off' : 'Sound is on';
      },
    }, v.muted ? 'Sound is off' : 'Sound is on');
    return h(
      'div',
      { class: 'sound-controls' },
      slider('Music', 'music'),
      slider('Effects', 'sfx', () => this.audio.cue('ui.click')),
      slider('Voices', 'voice', () => this.audio.babble(this.panelLoc ?? 'parents_house', 'Hei hei!', 0, 1)),
      mute,
    );
  }

  private showMenu() {
    const speedRow = h(
      'div',
      { class: 'speed' },
      (Object.keys(SPEEDS) as Speed[]).map((s) =>
        h('button', {
          class: s === this.speed ? 'primary' : '',
          onclick: () => {
            this.speed = s;
            storageSet(SPEED_KEY, s);
            m.close();
            this.showMenu();
          },
        }, s[0].toUpperCase() + s.slice(1)),
      ),
    );
    const m = this.openModal(
      h(
        'div',
        { class: 'menu' },
        h('h2', null, 'Menu'),
        h('h3', null, 'Computer player speed'),
        speedRow,
        h('h3', null, 'Sound'),
        this.soundControls(),
        h(
          'div',
          { class: 'menu-buttons' },
          h('button', { onclick: () => (m.close(), this.showHowTo()) }, 'How to play'),
          h('button', {
            onclick: () => {
              const el = document.documentElement;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen?.();
            },
          }, 'Toggle fullscreen'),
          h('button', {
            onclick: async () => {
              if (await this.confirm('Leave this game? It is saved and can be continued from the title screen.', 'Leave', 'Stay')) this.showTitle();
            },
          }, 'Save & exit'),
        ),
        h('p', { class: 'small muted' }, `Seed: ${this.state.seed}${this.state.settings.randomizeBalance ? ' · rules shuffled' : ''}`),
      ),
    );
  }

  render() {
    this.renderHud();
    this.renderPanel();
  }
}

function statusTabs(app: App): HTMLElement {
  const s = app.session!.state;
  const body = h('div');
  const tabs = h('div', { class: 'tabs' });
  const show = (p: PlayerState) => {
    clear(body);
    body.append(statusView(app.content, s, app.theme, p));
    for (const b of tabs.children) b.classList.toggle('active', (b as HTMLElement).dataset.id === p.id);
  };
  for (const p of s.players) tabs.append(h('button', { 'data-id': p.id, onclick: () => show(p) }, swatch(app.theme, p.color), ` ${p.name}`));
  show(currentPlayer(s));
  return h('div', null, s.players.length > 1 ? tabs : null, body);
}
