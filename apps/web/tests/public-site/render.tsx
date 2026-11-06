import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, Fragment, type FunctionComponent } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import { messagesByLocale } from './intl-server';

const require = createRequire(import.meta.url);

// Next aliases `server-only` when it bundles the app. Its metadata resolver
// imports the package, so load it with the same empty stub.
const serverOnlyStub = pathToFileURL(
  require.resolve('next/dist/compiled/server-only/empty.js'),
).href;
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    specifier === 'server-only'
      ? { shortCircuit: true, url: serverOnlyStub }
      : nextResolve(specifier, context),
});

const { accumulateMetadata } =
  require('next/dist/lib/metadata/resolve-metadata') as typeof import('next/dist/lib/metadata/resolve-metadata');
const { createSelectedMetadata, getDefinedMetadata } =
  require('next/dist/lib/metadata/metadata-resolution-primitives') as typeof import('next/dist/lib/metadata/metadata-resolution-primitives');
const { createMetadataElements } =
  require('next/dist/lib/metadata/metadata-elements') as typeof import('next/dist/lib/metadata/metadata-elements');
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string) => { window: { document: Document } };
};

interface PageProps {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string>>;
}

interface RouteModule {
  default: unknown;
  generateMetadata?: unknown;
  metadata?: unknown;
}

export interface PublicRoute {
  load: () => Promise<RouteModule>;
  params?: Record<string, string>;
  /** URL path after the locale prefix, such as `/blog`. */
  path: string;
  /** Folder names between `app/[lang]` and the page file. */
  segments: string[];
}

type MetadataItems = Parameters<typeof accumulateMetadata>[1];

/**
 * The `<head>` tags Next renders from the metadata of the root layout and the
 * page, one tag per line. Each folder between them is a tree level, which
 * decides whether the layout's title template applies to the page.
 */
export async function renderHead(
  route: PublicRoute,
  lang: Locale,
): Promise<string[]> {
  const layout = await import('@/app/[lang]/layout');
  const page = await route.load();
  const params = Promise.resolve({ lang, ...route.params });
  const pageRoute = ['/[lang]', ...route.segments].join('/');
  const items = [
    [null, null],
    [getDefinedMetadata(layout, { params }, { route: '/[lang]' }), null],
    ...route.segments.map(() => [null, null]),
    [
      getDefinedMetadata(
        page as never,
        { params, searchParams: Promise.resolve({}) },
        { route: pageRoute },
      ),
      null,
    ],
  ] as MetadataItems;
  const resolved = await accumulateMetadata(
    `${pageRoute}/page`,
    items,
    Promise.resolve(`/${lang}${route.path}`),
    { isStaticMetadataRouteFile: false, trailingSlash: false },
  );
  const markup = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      ...createMetadataElements(createSelectedMetadata(resolved)),
    ),
  );
  return markup.replaceAll('><', '>\n<').split('\n');
}

/** Server-renders the page the way Next streams it, inside the intl provider. */
export async function renderPage(
  route: PublicRoute,
  lang: Locale,
): Promise<Document> {
  const Page = (await route.load()).default as FunctionComponent<PageProps>;
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(
    <NextIntlClientProvider locale={lang} messages={messagesByLocale[lang]}>
      <Page
        params={Promise.resolve({ lang, ...route.params })}
        searchParams={Promise.resolve({})}
      />
    </NextIntlClientProvider>,
    {
      onError: (error) => {
        errors.push(error);
      },
    },
  );
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length > 0) {
    throw errors[0];
  }
  return new JSDOM(html).window.document;
}

export function jsonLdOf(document: Document): unknown[] {
  return [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].map((script) => JSON.parse(script.textContent ?? ''));
}
