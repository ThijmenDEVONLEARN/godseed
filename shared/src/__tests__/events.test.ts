import { expect, test } from 'vitest';
import { GAME_NAME, TEAMS } from '../index';

test('exports brand and the four teams', () => {
  expect(GAME_NAME).toBe('Godseed');
  expect(TEAMS).toEqual(['red', 'blue', 'yellow', 'green']);
});
