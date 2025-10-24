'use server';

import { cookies } from 'next/headers';

const PROMO_BANNER_COOKIE = `${process.env.NEXT_PUBLIC_PROMO_ID}-dismissed`;
const COOKIE_EXPIRY_DAYS = 30;

export const dismissBannerAction = async () => {
  // Set cookie to expire in 30 days
  const expiryDate = new Date();
  expiryDate.setTime(
    expiryDate.getTime() + COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );
  const cookieStore = await cookies();

  cookieStore.set({
    name: PROMO_BANNER_COOKIE,
    value: 'true',
    expires: expiryDate.getTime(),
    path: '/',
  });
};
