import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works from any sub-path (intranet, CDN folder, file share).
  base: './',
  build: {
    target: 'es2022',
    // Minified bundle keeps the rule files from being trivially readable in devtools.
    minify: 'esbuild',
    sourcemap: false,
  },
  server: { port: 5173 },
});
