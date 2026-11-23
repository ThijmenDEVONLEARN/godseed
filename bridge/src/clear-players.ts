import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createPlayers } from './players';

const players = createPlayers(fileURLToPath(new URL('../data/players.json', import.meta.url)));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question('Delete ALL player profiles (XP and levels)? Type "yes" to confirm: ');
rl.close();
if (answer.trim() === 'yes') { players.clear(); console.log('All profiles deleted.'); } else console.log('Nothing deleted.');
