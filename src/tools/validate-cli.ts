/** npm run validate — checks all content files and reports problems. */
import { ContentError } from '../engine/content';
import { createGame } from '../engine/game';
import { loadNodeContent } from './node-content';

try {
  const c = await loadNodeContent();
  // Smoke test: creating a game evaluates start stats and turn-start expressions.
  createGame(c, {
    players: [
      { name: 'A', color: 0, controller: 'ai' },
      { name: 'B', color: 1, controller: 'ai' },
    ],
    seed: 'validate',
  });
  console.log(
    `Content OK: ${c.locations.length} locations, ${c.items.length} items, ${c.jobs.length} jobs, ` +
      `${c.courses.length} courses, ${c.events.length} events, ${Object.keys(c.params).length} parameters, ` +
      `${c.modules.length} rule module(s).`,
  );
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
  } else {
    console.error(e);
  }
  process.exit(1);
}
