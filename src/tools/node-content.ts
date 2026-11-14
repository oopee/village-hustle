/** Loads /content from disk for Node tools (simulator, tuner, validator, tests). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildContent, type Content } from '../engine/content';
import type { RuleModule } from '../engine/rules-api';

export const CONTENT_DIR = resolve(import.meta.dirname, '../../content');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function readContentFiles(dir = CONTENT_DIR): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  for (const f of walk(dir)) {
    if (!f.endsWith('.json')) continue;
    const rel = relative(dir, f).replace(/\\/g, '/');
    try {
      files[rel] = JSON.parse(readFileSync(f, 'utf8'));
    } catch (e) {
      throw new Error(`content/${rel}: invalid JSON: ${(e as Error).message}`);
    }
  }
  return files;
}

export async function loadRuleModules(dir = CONTENT_DIR): Promise<RuleModule[]> {
  const rulesDir = join(dir, 'rules');
  const mods: RuleModule[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(rulesDir).filter((n) => n.endsWith('.ts')).sort();
  } catch {
    return mods;
  }
  for (const n of names) {
    const m = await import(pathToFileURL(join(rulesDir, n)).href);
    if (m.default) mods.push(m.default as RuleModule);
  }
  return mods;
}

export async function loadNodeContent(overrides?: (files: Record<string, unknown>) => void): Promise<Content> {
  const files = readContentFiles();
  overrides?.(files);
  return buildContent(files, await loadRuleModules());
}
