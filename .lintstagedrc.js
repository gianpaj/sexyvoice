module.exports = {
  '**/*.{js,cjs,mjs,json,jsonc,css}': 'pnpm exec ultracite fix',
  '**/*.{ts,tsx,mts,cts}': (files) => [
    `pnpm exec ultracite fix ${files.map((file) => JSON.stringify(file)).join(' ')}`,
    // Type checking runs after formatting and does not accept filename arguments.
    'pnpm type-check',
  ],
  '**/*.md': 'pnpm exec prettier --write',
};
