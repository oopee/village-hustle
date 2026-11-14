import '@fontsource/vt323';
import './style.css';
import { AudioPlayer } from '../audio/player';
import { ContentError } from '../engine';
import { App } from './app';
import { h } from './dom';
import { loadBrowserContent } from './load-content';
import { loadTheme } from './theme';

const stage = document.getElementById('stage')!;

function fit() {
  const W = Number(stage.dataset.w || 640);
  const H = Number(stage.dataset.h || 360);
  let s = Math.min(window.innerWidth / W, window.innerHeight / H);
  // Prefer whole-number scaling for crisp pixels when it costs little screen space.
  if (s >= 2 && Math.floor(s) / s > 0.85) s = Math.floor(s);
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${Math.round((window.innerWidth - W * s) / 2)}px`;
  stage.style.top = `${Math.round((window.innerHeight - H * s) / 2)}px`;
}

function fatal(title: string, lines: string[]) {
  stage.replaceChildren(h('div', { class: 'fatal' }, h('h1', null, title), h('ul', null, lines.map((l) => h('li', null, l)))));
}

async function boot() {
  window.addEventListener('resize', fit);
  fit();
  let content;
  try {
    content = loadBrowserContent();
  } catch (e) {
    fatal('The game content has errors', e instanceof ContentError ? e.problems : [String((e as Error).message ?? e)]);
    return;
  }
  document.title = content.game.title;
  let theme;
  try {
    theme = await loadTheme(
      content.game.theme,
      content.locations.map((l) => l.id),
      content.map.nodes,
    );
  } catch (e) {
    fatal('Could not load the graphics theme', [String((e as Error).message ?? e)]);
    return;
  }
  stage.dataset.w = String(theme.def.width);
  stage.dataset.h = String(theme.def.height);
  stage.style.width = `${theme.def.width}px`;
  stage.style.height = `${theme.def.height}px`;
  fit();
  await document.fonts?.load('16px VT323').catch(() => undefined);
  const audio = await AudioPlayer.load(theme.base);
  stage.replaceChildren();
  const app = new App(content, theme, stage, audio);
  app.showTitle();
  (window as unknown as { app: App }).app = app;
}

void boot();
