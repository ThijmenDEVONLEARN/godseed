import { fileURLToPath } from 'node:url';
import { createBridge } from './server';
import { startTikTok } from './tiktok';

const port = Number(process.env.BRIDGE_PORT ?? 8765);
const dataFile = fileURLToPath(new URL('../data/highscores.json', import.meta.url));
const bridge = await createBridge(port, dataFile);
console.log(`bridge on ws://localhost:${port}  (test panel posts to http://localhost:${port}/fake)`);

const username = process.env.TIKTOK_USERNAME?.trim();
if (username) startTikTok(username, bridge.publish, process.env.TIKTOK_SIGN_API_KEY?.trim() || undefined);
else console.log('tiktok: TIKTOK_USERNAME not set in .env, test panel only');
