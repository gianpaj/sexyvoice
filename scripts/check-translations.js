/** biome-ignore-all lint/style/useNodejsImportProtocol: <explanation> */
const fs = require('fs');
const path = require('path');

// Path to dictionaries folder
const DICTIONARIES_PATH = path.join(__dirname, '../lib/i18n/dictionaries');

// Function to get all keys in a nested object (flattened with dot notation)
function getAllKeys(obj, parentKey = '') {
  let keys = [];

  for (const key in obj) {
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
    const files = fs
      .readdirSync(DICTIONARIES_PATH)
      .filter((file) => file.endsWith('.json'));

    if (files.length === 0) {
      console.error('No translation files found!');
      return;
    }

    console.log(`Found ${files.length} translation files: ${files.join(', ')}`);

    // Load all translation files
    const translations = {};
    for (const file of files) {
      const filePath = path.join(DICTIONARIES_PATH, file);
      const content = fs.readFileSync(filePath, 'utf8');
      translations[file] = JSON.parse(content);
    }

    // Extract all keys from each file
    const allKeysMap = {};
    for (const file in translations) {
      allKeysMap[file] = getAllKeys(translations[file]);
    }

    // Create a unified set of all keys from all files
    const allKeys = new Set();
    for (const file in allKeysMap) {
      allKeysMap[file].forEach((key) => allKeys.add(key));
    }

    // Check for missing keys in each file
    let hasErrors = false;

    for (const file in translations) {
      const missingKeys = [];

      for (const key of allKeys) {
        if (!keyExists(translations[file], key)) {
          missingKeys.push(key);
        }
      }

      if (missingKeys.length > 0) {
        hasErrors = true;
        console.error(`\n🚨 Missing keys in ${file}:`);
        missingKeys.forEach((key) => console.error(`  - ${key}`));
      }
    }

    if (!hasErrors) {
      console.log(
        '\n✅ All translation files contain the same keys. No missing translations found!',
      );
    } else {
      console.error(
        '\n❌ Found missing translations. Please fix the issues above.',
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('Error checking translations:', error);
    process.exit(1);
  }
}

// Run the check
checkTranslations();
