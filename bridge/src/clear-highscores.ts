import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../data/highscores.json', import.meta.url));
if (!existsSync(file)) {
  console.log('No highscores yet.');
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Delete ALL highscores? Type "yes" to confirm: ');
  rl.close();
  if (answer.trim() === 'yes') { writeFileSync(file, '[]'); console.log('Highscores cleared.'); } else console.log('Nothing deleted.');
}
