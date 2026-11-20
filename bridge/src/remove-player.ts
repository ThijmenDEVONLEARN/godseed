import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createPlayers } from './players';

const id = process.argv[2];
const players = createPlayers(fileURLToPath(new URL('../data/players.json', import.meta.url)));
if (!id) console.log('Usage: pnpm --filter @godseed/bridge remove-player <tiktok id>');
else if (!players.get([id]).length) console.log(`No player "${id}".`);
else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Delete the profile of "${id}"? Type "yes" to confirm: `);
  rl.close();
  console.log(answer.trim() === 'yes' && players.remove(id) ? 'Deleted.' : 'Nothing deleted.');
}
