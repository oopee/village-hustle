/** Runs simulated games in parallel on worker threads. */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { SimGameResult } from './simulate';
import type { SimJob } from './worker';

export type { SimJob };

export class SimPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { job: SimJob; resolve: (r: SimGameResult) => void; reject: (e: Error) => void }[] = [];
  private pending = new Map<number, { resolve: (r: SimGameResult) => void; reject: (e: Error) => void; worker: Worker }>();
  private nextId = 1;

  constructor(size = Math.max(1, availableParallelism() - 1)) {
    const file = new URL('./worker-boot.mjs', import.meta.url);
    for (let i = 0; i < size; i++) {
      const w = new Worker(file);
      w.on('message', (msg: { id: number; result?: SimGameResult; error?: string }) => {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result!);
        this.idle.push(w);
        this.pump();
      });
      w.on('error', (e) => {
        for (const [id, p] of this.pending) if (p.worker === w) (this.pending.delete(id), p.reject(e));
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  get size() {
    return this.workers.length;
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const { job, resolve, reject } = this.queue.shift()!;
      this.pending.set(job.id, { resolve, reject, worker: w });
      w.postMessage(job);
    }
  }

  run(job: Omit<SimJob, 'id'>): Promise<SimGameResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { ...job, id: this.nextId++ }, resolve, reject });
      this.pump();
    });
  }

  /** Runs many games; calls onProgress after each finishes. Results keep the input order. */
  async runAll(jobs: Omit<SimJob, 'id'>[], onProgress?: (done: number) => void): Promise<SimGameResult[]> {
    let done = 0;
    return Promise.all(
      jobs.map((j) =>
        this.run(j).then((r) => {
          onProgress?.(++done);
          return r;
        }),
      ),
    );
  }

  async close() {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/** Standard job list: profiles rotate across seats so each strategy gets every seat equally. */
export function standardJobs(opts: {
  games: number;
  players: number;
  profiles: string[];
  seed: string;
  randomize: boolean;
  goals?: Record<string, number>;
  overrides?: Record<string, number>;
}): Omit<SimJob, 'id'>[] {
  return Array.from({ length: opts.games }, (_, g) => ({
    players: Array.from({ length: opts.players }, (_, i) => opts.profiles[(g + i) % opts.profiles.length]),
    seed: `${opts.seed}-${g}`,
    randomizeBalance: opts.randomize,
    goals: opts.goals,
    overrides: opts.overrides,
  }));
}
