module.exports = {
  // Run type-check on TypeScript files, but do not pass any filename arguments
  '**/*.ts?(x)': () => 'pnpm type-check',
};
