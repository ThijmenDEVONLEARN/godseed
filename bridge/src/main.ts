import { fileURLToPath } from 'node:url';
import { createBridge } from './server';

const port = Number(process.env.BRIDGE_PORT ?? 8765);
const dataFile = fileURLToPath(new URL('../data/highscores.json', import.meta.url));
await createBridge(port, dataFile);
console.log(`bridge on ws://localhost:${port}  (test panel posts to http://localhost:${port}/fake)`);
