import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadNodeContent } from '../src/tools/node-content';
import type { ThemeDef } from '../src/ui/theme';

const THEME = resolve(import.meta.dirname, '../public/themes/ryttyla');
const def = JSON.parse(readFileSync(join(THEME, 'theme.json'), 'utf8')) as ThemeDef;

describe('shipped theme', () => {
  it('every clickable prop and regular has lines in content, and every poke has art', async () => {
    const content = await loadNodeContent();
    for (const loc of content.locations) {
      const art = def.locations[loc.id];
      const ids = new Set([...(art?.props ?? []).map((p) => p.id), ...(art?.extras ?? []).map((x) => x.id)]);
      for (const id of ids) expect(loc.pokes[id], `pokes.${id} in ${loc.id}`).toBeTruthy();
      for (const id of Object.keys(loc.pokes)) expect(ids.has(id), `theme prop/extra '${id}' in ${loc.id}`).toBe(true);
    }
  });

  it('regulars match an action at their location, and furniture matches items', async () => {
    const content = await loadNodeContent();
    for (const [locId, art] of Object.entries(def.locations)) {
      const loc = content.locationById.get(locId);
      for (const x of art.extras ?? []) expect(loc?.actions.some((a) => a.id === x.id), `action '${x.id}' at ${locId}`).toBe(true);
      for (const item of Object.keys(art.furniture ?? {})) expect(content.itemById.has(item), `item '${item}'`).toBe(true);
    }
  });

  it('all referenced images exist', () => {
    const files: string[] = [];
    for (const art of Object.values(def.locations)) {
      for (const x of art.extras ?? []) files.push(x.sprite);
      for (const f of Object.values(art.furniture ?? {})) files.push(f.sprite);
    }
    for (const f of files) expect(existsSync(join(THEME, f)), f).toBe(true);
  });
});
