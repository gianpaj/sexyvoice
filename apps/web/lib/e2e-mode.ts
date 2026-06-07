export const isE2E = () =>
  process.env.E2E_TEST_MODE === 'true' &&
  process.env.VERCEL_ENV !== 'production';
