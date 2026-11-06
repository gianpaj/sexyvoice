// Fails the build unless every locale in `routing` has a message file with
// the same keys as the others. Arrays count as single values.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { routing } from '../src/i18n/routing.ts';

const MESSAGES_PATH = fileURLToPath(new URL('../messages', import.meta.url));

function getAllKeys(obj, parentKey = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const currentKey = parentKey ? `${parentKey}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? getAllKeys(value, currentKey)
      : [currentKey];
  });
}

function fail(lines) {
  console.error(['', ...lines].join('\n'));
  process.exit(1);
}

const fileLocales = readdirSync(MESSAGES_PATH)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));
const missingFiles = routing.locales.filter(
  (locale) => !fileLocales.includes(locale),
);
const unknownFiles = fileLocales.filter(
  (locale) => !routing.locales.includes(locale),
);

if (missingFiles.length > 0 || unknownFiles.length > 0) {
  fail([
    '❌ Message files do not match the locales in src/i18n/routing.ts.',
    ...missingFiles.map((locale) => `  - missing messages/${locale}.json`),
    ...unknownFiles.map(
      (locale) => `  - messages/${locale}.json is not a configured locale`,
    ),
  ]);
}

const keysByLocale = Object.fromEntries(
  routing.locales.map((locale) => [
    locale,
    new Set(
      getAllKeys(
        JSON.parse(readFileSync(join(MESSAGES_PATH, `${locale}.json`), 'utf8')),
      ),
    ),
  ]),
);
const allKeys = new Set(
  Object.values(keysByLocale).flatMap((keys) => [...keys]),
);
const missingKeys = routing.locales.flatMap((locale) => {
  const missing = [...allKeys].filter((key) => !keysByLocale[locale].has(key));
  return missing.length > 0
    ? [
        `🚨 Missing keys in ${locale}.json:`,
        ...missing.map((key) => `  - ${key}`),
      ]
    : [];
});

if (missingKeys.length > 0) {
  fail(['❌ Found missing translations.', ...missingKeys]);
}

console.log(
  `✅ ${routing.locales.length} message files contain the same keys: ${routing.locales.join(', ')}`,
);
