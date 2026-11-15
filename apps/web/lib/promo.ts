/**
 * The promo campaign switch: banners advertise the promo and checkout grants
 * its bonus credits while it is on.
 */
export function isPromoEnabled() {
  return process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';
}
