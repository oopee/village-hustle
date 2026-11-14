import { describe, expect, it } from 'vitest';
import { ContentError } from '../src/engine';
import { loadNodeContent } from '../src/tools/node-content';

type Files = Record<string, unknown>;
const location = (files: Files, id: string) => files[`locations/${id}.json`] as { actions: Record<string, unknown>[]; node: string };

describe('content', () => {
  it('the shipped content is valid', async () => {
    const c = await loadNodeContent();
    expect(c.locations.length).toBeGreaterThan(5);
    expect(c.jobs.length).toBeGreaterThan(5);
    for (const loc of c.locations) expect(c.map.nodes).toContain(loc.node);
  });

  it('reports a syntax error in an expression with its file', async () => {
    const err = await loadNodeContent((files) => {
      location(files, 'sauna').actions[0].time = 'params.saunaTime +';
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect(String(err.message)).toContain('sauna');
  });

  it('reports an unknown parameter', async () => {
    const err = await loadNodeContent((files) => {
      location(files, 'sauna').actions[0].time = 'params.noSuchParameter';
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect(String(err.message)).toContain('noSuchParameter');
  });

  it('reports a location on a map node that does not exist', async () => {
    const err = await loadNodeContent((files) => {
      location(files, 'sauna').node = 'atlantis';
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect(String(err.message)).toContain('atlantis');
  });

  it('content hash changes when content changes', async () => {
    const a = await loadNodeContent();
    const b = await loadNodeContent((files) => {
      (files['game.json'] as { title: string }).title = 'Something else';
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
