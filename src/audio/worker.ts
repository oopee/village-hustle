/**
 * Renders audio off the main thread: songs, sound effects and host voices. The page sends
 * a request, the worker answers with raw stereo samples (transferred, not copied).
 */
import { renderSong } from './synth/render';
import { renderSfx, SFX } from './synth/sfx';
import { renderVoiceSet, type VoiceDef } from './synth/voice';
import type { SongDef } from './synth/song';

export type RenderJob =
  | { kind: 'song'; def: SongDef }
  | { kind: 'sfx'; name: string; variant: number }
  | { kind: 'voice'; def: VoiceDef }
  | { kind: 'meta' };
export type RenderRequest = RenderJob & { req: number };

export type RenderReply =
  | { req: number; kind: 'pcm'; left: Float32Array; right: Float32Array; sr: number; loop: boolean }
  | { req: number; kind: 'voice'; sr: number; blips: Record<string, Float32Array> }
  | { req: number; kind: 'meta'; variants: Record<string, number> }
  | { req: number; kind: 'error'; message: string };

/** Does the work for one request; shared by the worker and the main-thread fallback. */
export function handle(m: RenderRequest): { reply: RenderReply; transfer: ArrayBuffer[] } {
  try {
    switch (m.kind) {
      case 'song': {
        const r = renderSong(m.def);
        for (const w of r.warnings) console.warn(`song ${m.def.id ?? ''}: ${w}`);
        return { reply: { req: m.req, kind: 'pcm', left: r.left, right: r.right, sr: r.sr, loop: r.loop }, transfer: [r.left.buffer as ArrayBuffer, r.right.buffer as ArrayBuffer] };
      }
      case 'sfx': {
        const r = renderSfx(m.name, m.variant);
        return { reply: { req: m.req, kind: 'pcm', left: r.left, right: r.right, sr: r.sr, loop: false }, transfer: [r.left.buffer as ArrayBuffer, r.right.buffer as ArrayBuffer] };
      }
      case 'voice': {
        const sr = 44100;
        const blips = renderVoiceSet(m.def, sr);
        return { reply: { req: m.req, kind: 'voice', sr, blips }, transfer: Object.values(blips).map((b) => b.buffer as ArrayBuffer) };
      }
      case 'meta':
        return { reply: { req: m.req, kind: 'meta', variants: Object.fromEntries(Object.entries(SFX).map(([k, d]) => [k, d.variants ?? 1])) }, transfer: [] };
    }
  } catch (e) {
    return { reply: { req: m.req, kind: 'error', message: String((e as Error)?.message ?? e) }, transfer: [] };
  }
}

// Running as a worker: answer messages.
const scope = globalThis as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage?: (m: unknown, t: ArrayBuffer[]) => void; document?: unknown };
if (typeof scope.document === 'undefined' && typeof scope.postMessage === 'function') {
  scope.onmessage = (e: MessageEvent) => {
    const { reply, transfer } = handle(e.data as RenderRequest);
    scope.postMessage!(reply, transfer);
  };
}
