/**
 * Build-time feature gates for pages that are merged but not ready to ship.
 *
 * Keep each flag as the single source of truth for every entry point it
 * guards (page, in-app links, sitemap) so shipping a feature is a one-line
 * change here rather than a hunt across the codebase.
 */

/**
 * The public voice cloning landing page at `/[lang]/voice-cloning`.
 *
 * Enabled everywhere except production so the demo stays reviewable on Vercel
 * previews while its audio is still TTS-generated placeholder material. Flip
 * this to `true` once the cloning model is live.
 *
 * Gates: the page itself, the landing page card, the footer link, and the
 * sitemap entry. Only referenced from server components, so the non-public
 * `VERCEL_ENV` is available at runtime.
 */
export const VOICE_CLONING_PAGE_ENABLED =
  process.env.VERCEL_ENV !== 'production';
