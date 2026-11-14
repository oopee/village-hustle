/** Worker thread: plays simulated games on request. Started by SimPool. */
import { parentPort } from 'node:worker_threads';
import type { Content } from '../engine';
import { loadNodeContent } from '../tools/node-content';
import { simulateGame, type SimOptions } from './simulate';

export interface SimJob extends SimOptions {
  id: number;
  /** Balance parameter base values to use instead of balance.json. */
  overrides?: Record<string, number>;
}

let content: Content | null = null;
let original: Record<string, number> = {};

parentPort!.on('message', async (job: SimJob) => {
  try {
    if (!content) {
      content = await loadNodeContent();
      original = Object.fromEntries(Object.entries(content.params).map(([k, p]) => [k, p.value]));
    }
    for (const [k, v] of Object.entries(original)) content.params[k].value = job.overrides?.[k] ?? v;
    const result = simulateGame(content, job);
    parentPort!.postMessage({ id: job.id, result });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, error: String((e as Error)?.stack ?? e) });
  }
});
