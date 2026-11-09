import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    // The simulation must stay deterministic and free of rendering code.
    files: ['game/src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'Date', 'performance', 'setTimeout', 'setInterval', 'window', 'document'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use world.rng.' }],
      'no-restricted-imports': ['error', { patterns: ['pixi.js', '**/render/**', '**/ui/**'] }],
    },
  },
);
