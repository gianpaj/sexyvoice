module.exports = {
  // Run typecheck on TypeScript files, but do not pass any filename arguments
  '**/*.ts?(x)': () => 'pnpm typecheck',
};
