import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Path to dictionaries folder
const DICTIONARIES_PATH = join(__dirname, '../lib/i18n/dictionaries');

// Function to get all keys in a nested object (flattened with dot notation)
function getAllKeys(obj, parentKey = '') {
  let keys = [];

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const currentKey = parentKey ? `${parentKey}.${key}` : key;

      if (
        typeof obj[key] === 'object' &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        // Recursive call for nested objects
        keys = [...keys, ...getAllKeys(obj[key], currentKey)];
      } else {
        keys.push(currentKey);
      }
    }
  }

  return keys;
}

// Function to check if a key exists in an object (using dot notation)
function keyExists(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return false;
    }
    current = current[part];
  }

  return true;
}

// Main function to check translations
function checkTranslations() {
  try {
    // Read all JSON files in the dictionaries folder
    const files = readdirSync(DICTIONARIES_PATH).filter((file) =>
      file.endsWith('.json'),
    );

    if (files.length === 0) {
      console.error('No translation files found!');
      return;
    }

    console.log(`Found ${files.length} translation files: ${files.join(', ')}`);

    // Load all translation files
    const translations = loadTranslations(files);

    // Extract all keys from each file
    const allKeysMap = extractAllKeysMap(translations);

    // Create a unified set of all keys from all files
    const allKeys = createUnifiedKeySet(allKeysMap);

    // Check for missing keys in each file
    const missingKeysByFile = findMissingKeys(translations, allKeys);

    if (Object.keys(missingKeysByFile).length > 0) {
      reportMissingKeys(missingKeysByFile);
      process.exit(1);
    } else {
      console.log(
        '\n✅ All translation files contain the same keys. No missing translations found!',
      );
    }
  } catch (error) {
    console.error('Error checking translations:', error);
    process.exit(1);
  }
}

function loadTranslations(files) {
  const translations = {};
  for (const file of files) {
    const filePath = join(DICTIONARIES_PATH, file);
    const content = readFileSync(filePath, 'utf8');
    translations[file] = JSON.parse(content);
  }
  return translations;
}

function extractAllKeysMap(translations) {
  const allKeysMap = {};
  for (const file in translations) {
    if (Object.hasOwn(translations, file)) {
      allKeysMap[file] = getAllKeys(translations[file]);
    }
  }
  return allKeysMap;
}

function createUnifiedKeySet(allKeysMap) {
  const allKeys = new Set();
  for (const file in allKeysMap) {
    if (Object.hasOwn(allKeysMap, file)) {
      for (const key of allKeysMap[file]) {
        allKeys.add(key);
      }
    }
  }
  return allKeys;
}

function findMissingKeys(translations, allKeys) {
  const missingKeysByFile = {};

  for (const file in translations) {
    if (Object.hasOwn(translations, file)) {
      const missingKeys = [];

      for (const key of allKeys) {
        if (!keyExists(translations[file], key)) {
          missingKeys.push(key);
        }
      }

      if (missingKeys.length > 0) {
        missingKeysByFile[file] = missingKeys;
      }
    }
  }

  return missingKeysByFile;
}

function reportMissingKeys(missingKeysByFile) {
  console.error(
    '\n❌ Found missing translations. Please fix the issues above.',
  );

  for (const file in missingKeysByFile) {
    if (Object.hasOwn(missingKeysByFile, file)) {
      console.error(`\n🚨 Missing keys in ${file}:`);
      for (const key of missingKeysByFile[file]) {
        console.error(`  - ${key}`);
      }
    }
  }
}

// Run the check
checkTranslations();
