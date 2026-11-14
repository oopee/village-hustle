/**
 * Loads game content in the browser. Vite bundles every JSON file under /content
 * and every rule module under /content/rules at build time, so adding a file is
 * enough; no registration needed.
 */
import { buildContent, type Content, type RuleModule } from '../engine';

const jsonFiles = import.meta.glob('/content/**/*.json', { eager: true, import: 'default' });
const ruleFiles = import.meta.glob('/content/rules/*.ts', { eager: true, import: 'default' });

export function loadBrowserContent(): Content {
  const modules = Object.keys(ruleFiles)
    .sort()
    .map((k) => ruleFiles[k] as RuleModule)
    .filter(Boolean);
  return buildContent(jsonFiles as Record<string, unknown>, modules);
}
