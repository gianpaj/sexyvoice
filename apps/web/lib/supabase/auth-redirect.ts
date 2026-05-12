import { NextResponse } from 'next/server';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import {
  AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
  createAuthCallbackMarkerValue,
} from './auth-callback-marker';
import { AUTH_CALLBACK_COOKIE_NAME } from './constants';

export const getSafeAuthRedirectPath = (
  value: string | null,
  origin: string,
) => {
  const redirectValue = value?.trim();

  if (!redirectValue || redirectValue.startsWith('//')) {
    return null;
  }

  try {
    const redirectUrl = redirectValue.startsWith('/')
      ? new URL(redirectValue, origin)
      : new URL(redirectValue);

    if (redirectUrl.origin !== origin) {
      return null;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return null;
  }
};

export const getLocaleFromRedirectPath = (
  redirectPath: string | null,
): Locale => {
  const locale = redirectPath?.split('/')[1];

  return i18n.locales.includes(locale as Locale)
    ? (locale as Locale)
    : i18n.defaultLocale;
};

export const createAuthRedirectResponse = (url: string) => {
  const response = NextResponse.redirect(url);
  const markerValue = createAuthCallbackMarkerValue();

  if (markerValue) {
    response.cookies.set({
      name: AUTH_CALLBACK_COOKIE_NAME,
      value: markerValue,
      httpOnly: true,
      maxAge: AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
};
