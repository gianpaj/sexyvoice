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

    return `/${redirectUrl.pathname.replace(/^\/+/, '')}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return null;
  }
};

const getSupportedLocale = (
  value: string | null | undefined,
): Locale | null => {
  const locale = value?.trim().toLowerCase().split('-')[0];

  return i18n.locales.includes(locale as Locale) ? (locale as Locale) : null;
};

const getLocaleFromAcceptLanguage = (
  acceptLanguage: string | null,
): Locale | null =>
  acceptLanguage
    ?.split(',')
    .map((languageRange) => {
      const [languageTag, ...parameters] = languageRange.trim().split(';');
      const qualityParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith('q='));
      const quality = qualityParameter
        ? Number(qualityParameter.slice('q='.length))
        : 1;

      return {
        locale: getSupportedLocale(languageTag),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter(({ locale, quality }) => locale && quality > 0)
    .sort((a, b) => b.quality - a.quality)[0]?.locale ?? null;

export const getLocaleFromRedirectPath = (
  redirectPath: string | null,
): Locale => {
  return getSupportedLocale(redirectPath?.split('/')[1]) ?? i18n.defaultLocale;
};

export const getLocaleFromAuthHints = ({
  acceptLanguage,
  locale,
  redirectPath,
}: {
  acceptLanguage: string | null;
  locale: string | null;
  redirectPath: string | null;
}): Locale => {
  return (
    getSupportedLocale(redirectPath?.split('/')[1]) ??
    getSupportedLocale(locale) ??
    getLocaleFromAcceptLanguage(acceptLanguage) ??
    i18n.defaultLocale
  );
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
