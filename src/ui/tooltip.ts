/**
 * In-game tooltips. Any element with a `title` (or `data-tip`) inside the stage gets a
 * pixel-styled tooltip instead of the browser's own. The title is moved to `data-tip`
 * the first time the pointer reaches it, so the native tooltip never appears.
 */
const SHOW_DELAY = 350;

export function installTooltips(stage: HTMLElement) {
  const tip = document.createElement('div');
  tip.className = 'tooltip hidden';
  tip.setAttribute('role', 'tooltip');
  stage.append(tip);

  let target: HTMLElement | null = null;
  let timer = 0;
  let lastX = 0;
  let lastY = 0;

  const textOf = (el: HTMLElement) => {
    const t = el.getAttribute('title');
    if (t !== null) {
      el.removeAttribute('title');
      if (t) el.dataset.tip = t;
    }
    return el.dataset.tip ?? '';
  };

  const hide = () => {
    clearTimeout(timer);
    target = null;
    tip.classList.add('hidden');
  };

  const place = () => {
    // The stage is CSS-scaled; work in its logical pixels.
    const r = stage.getBoundingClientRect();
    const scale = r.width / stage.offsetWidth || 1;
    const x = (lastX - r.left) / scale;
    const y = (lastY - r.top) / scale;
    const W = stage.offsetWidth;
    const H = stage.offsetHeight;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = x + 10;
    let top = y + 14;
    if (left + w > W - 2) left = Math.max(2, x - w - 6);
    if (top + h > H - 2) top = Math.max(2, y - h - 8);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };

  const show = () => {
    if (!target || !target.isConnected) return hide();
    const text = textOf(target);
    if (!text) return hide();
    tip.replaceChildren(...text.split('\n').map((line) => Object.assign(document.createElement('p'), { textContent: line })));
    tip.classList.remove('hidden');
    stage.append(tip); // keep it above dialogs opened since
    place();
  };

  stage.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
    if (el === tip || tip.contains(el)) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (el === target) return;
    hide();
    if (!el || !stage.contains(el)) return;
    textOf(el); // strip the native title right away
    target = el;
    timer = window.setTimeout(show, SHOW_DELAY);
  });
  stage.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (target && !tip.classList.contains('hidden')) place();
  });
  stage.addEventListener('pointerout', (e) => {
    if (target && !target.contains(e.relatedTarget as Node | null)) hide();
  });
  stage.addEventListener('pointerdown', hide, true);
  window.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
}
