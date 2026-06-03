'use server';

import { cookies } from 'next/headers';

import { getBannerDefinition } from '@/lib/banners/registry';

export const dismissBannerAction = async (bannerId: string) => {
  const banner = getBannerDefinition(bannerId);
  if (!banner) {
    return;
  }

  const expiryDate = new Date();
  expiryDate.setTime(
    expiryDate.getTime() + banner.dismiss.days * 24 * 60 * 60 * 1000,
  );

  const cookieStore = await cookies();
  cookieStore.set({
    expires: expiryDate,
    name: banner.dismiss.cookieKey,
    path: '/',
    value: 'true',
  });
};
