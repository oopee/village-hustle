// Registers the TypeScript loader inside a worker thread, then starts the real worker.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
