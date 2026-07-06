#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const scriptStartedAt = new Date().toISOString().replace(/[:.]/g, '-');

config({
  path: [
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env'),
    path.join(repoRoot, 'apps/web/.env.local'),
    path.join(repoRoot, 'apps/web/.env'),
    path.join(scriptDir, '.env.local'),
    path.join(scriptDir, '.env'),
  ],
});

// Voice IDs from https://docs.x.ai/docs/api-reference#tts
const VOICES = [
  {
    voice_id: 'yis75yfp',
    display_name: 'Manuel',
    language: 'en',
    gender: 'female',
    age: 'young',
  },
  // { voice_id: 'om17cury', display_name: 'Irina', language: 'ru', gender: 'female', age: 'young' },
  // { voice_id: 'hqxr4yub', display_name: 'Luca', language: 'it', gender: 'female', age: 'middle-aged' },
  // { voice_id: '73xd5dum', display_name: 'Ananya', language: 'hi', gender: 'female', age: 'young' },
  // { voice_id: '69smp8rm', display_name: 'Camille', language: 'fr', gender: 'female', age: 'middle-aged' },
  // { voice_id: '97zmdc6s', display_name: 'Ida', language: 'da', gender: 'female', age: 'middle-aged' },
  // {
  //   "voice_id": "f8cf5c2c78d4",
  //   "name": "Grace",
  //   "language": "en",
  //   "gender": "female",
  //   "age": "young"
  // },
  // {
  //   "voice_id": "d634b6da3d3b",
  //   "name": "Aylin",
  //   "language": "tr",
  //   "gender": "female",
  //   "age": "old"
  // },
  // {
  //   "voice_id": "d0cb9ff07d95",
  //   "name": "Sakura",
  //   "language": "ja",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "c3a2c594479e",
  //   "name": "Helmi",
  //   "language": "fi",
  //   "gender": "female",
  //   "age": "young"
  // },
  // {
  //   "voice_id": "97fabd54445f",
  //   "name": "Katarzyna",
  //   "language": "pl",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "79f3a8b96d43",
  //   "name": "Claire",
  //   "language": "en",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "6da5baee46d0",
  //   "name": "Beatriz",
  //   "language": "pt",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "58d27475085e",
  //   "name": "Femke",
  //   "language": "nl",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "490ea3be50b1",
  //   "name": "Saga",
  //   "language": "sv-SE",
  //   "gender": "female",
  //   "age": "young"
  // },
  // {
  //   "voice_id": "458705c07139",
  //   "name": "Clara",
  //   "language": "de",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "3a7889066fa2",
  //   "name": "Lena",
  //   "language": "de",
  //   "gender": "female",
  //   "age": "young"
  // },
  // {
  //   "voice_id": "35c8d7f60dc8",
  //   "name": "Layla",
  //   "language": "ar",
  //   "gender": "female",
  //   "age": "young"
  // },
  // {
  //   "voice_id": "34fd4dce1ba3",
  //   "name": "Elina",
  //   "language": "fi",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "247783ebdd51",
  //   "name": "Noor",
  //   "language": "nl",
  //   "gender": "female",
  //   "age": "middle-aged"
  // },
  // {
  //   "voice_id": "1b12d5daee6b",
  //   "name": "Aleksandra",
  //   "language": "pl",
  //   "gender": "female",
  //   "age": "young"
  // },
  // {
  //   "voice_id": "0895a5b8ce5c",
  //   "name": "Mai",
  //   "language": "vi",
  //   "gender": "female",
  //   "age": "young"
  // }
];

const VOICE_MAP = Object.fromEntries(VOICES.map((v) => [v.voice_id, v]));

const DEFAULT_VOICES = VOICES.map((v) => v.voice_id);

const DEFAULT_TEXT =
  '<soft>Oh baby... right there...</soft> [inhale] [sigh] <build-intensity>yes, just like that, don’t you dare stop</build-intensity> [breath] <higher-pitch>mmm it’s building so deep inside me</higher-pitch>';
const DEFAULT_LANGUAGE = 'en-US';

const LANGUAGE_TEXTS = {
  en: '<soft>Oh baby... right there...</soft> [inhale] [sigh] <build-intensity>yes, just like that, don’t you dare stop</build-intensity> [breath] <higher-pitch>mmm it’s building so deep inside me</higher-pitch>',
  ru: '<soft>О боже... вот так...</soft> [inhale] [sigh] <build-intensity>да, именно так, только не останавливайся</build-intensity> [breath] <higher-pitch>ммм, это нарастает так глубоко во мне</higher-pitch>',
  it: '<soft>Oh tesoro... proprio lì...</soft> [inhale] [sigh] <build-intensity>sì, proprio così, non osare fermarti</build-intensity> [breath] <higher-pitch>mmm si accumula così profondo dentro di me</higher-pitch>',
  hi: '<soft>ओह बेबी... वहीं पर...</soft> [inhale] [sigh] <build-intensity>हाँ, बिल्कुल ऐसे, रुकने की हिम्मत मत करना</build-intensity> [breath] <higher-pitch>म्म्म यह मेरे अंदर इतनी गहराई में बन रहा है</higher-pitch>',
  fr: '<soft>Oh chéri... juste là...</soft> [inhale] [sigh] <build-intensity>oui, exactement comme ça, n’ose pas t’arrêter</build-intensity> [breath] <higher-pitch>mmm ça monte si profond en moi</higher-pitch>',
  da: '<soft>Åh skat... lige der...</soft> [inhale] [sigh] <build-intensity>ja, ligesom det, vov ikke at stoppe</build-intensity> [breath] <higher-pitch>mmm det bygger sig op så dybt inde i mig</higher-pitch>',
  tr: '<soft>Oh bebeğim... tam orada...</soft> [inhale] [sigh] <build-intensity>evet, işte böyle, durmaya cesaret etme</build-intensity> [breath] <higher-pitch>mmm içimde çok derinlerde birikiyor</higher-pitch>',
  ja: '<soft>ああ、ベイビー... そこよ...</soft> [inhale] [sigh] <build-intensity>そう、ちょうどそんな感じ、絶対に止めないで</build-intensity> [breath] <higher-pitch>んん... 奥深くで高まってきてる</higher-pitch>',
  fi: '<soft>Oi kultaseni... juuri siellä...</soft> [inhale] [sigh] <build-intensity>kyllä, juuri noin, älä uskalla lopettaa</build-intensity> [breath] <higher-pitch>mmm se rakentuu niin syvälle minussa</higher-pitch>',
  pl: '<soft>O boże... właśnie tam...</soft> [inhale] [sigh] <build-intensity>tak, dokładnie tak, nie waż się przestawać</build-intensity> [breath] <higher-pitch>mmm to narasta tak głęboko we mnie</higher-pitch>',
  pt: '<soft>Oh querido... bem ali...</soft> [inhale] [sigh] <build-intensity>sim, exatamente assim, não se atreva a parar</build-intensity> [breath] <higher-pitch>mmm está crescendo tão fundo dentro de mim</higher-pitch>',
  nl: '<soft>Oh schatje... precies daar...</soft> [inhale] [sigh] <build-intensity>ja, precies zo, durf niet te stoppen</build-intensity> [breath] <higher-pitch>mmm het groeit zo diep in mij</higher-pitch>',
  'sv-SE':
    '<soft>Åh älskling... precis där...</soft> [inhale] [sigh] <build-intensity>ja, precis så, våga inte sluta</build-intensity> [breath] <higher-pitch>mmm det byggs upp så djupt inne i mig</higher-pitch>',
  de: '<soft>Oh Liebling... genau dort...</soft> [inhale] [sigh] <build-intensity>ja, genau so, wag es nicht aufzuhören</build-intensity> [breath] <higher-pitch>mmm es baut sich so tief in mir auf</higher-pitch>',
  ar: '<soft>آه حبيبي... هناك تماماً...</soft> [inhale] [sigh] <build-intensity>نعم، هكذا بالضبط، لا تجرؤ على التوقف</build-intensity> [breath] <higher-pitch>مم... إنه يتصاعد عميقاً جداً في داخلي</higher-pitch>',
  vi: '<soft>Ôi em yêu... đúng chỗ đó...</soft> [inhale] [sigh] <build-intensity>có, cứ như vậy đi, đừng dám dừng lại</build-intensity> [breath] <higher-pitch>mmm nó đang xây dựng sâu trong em</higher-pitch>',
};

function printHelp() {
  console.log(`Generate xAI TTS speech samples via the xAI TTS API.

Usage:
  node generate-xai-speech-samples.mjs -- --voices yis75yfp,abc123 --text "Hello" --language es-MX

Environment:
  XAI_API_KEY   Required Bearer API key

Options:
  --text <text>           Text to synthesize
  --language <lang>       BCP-47 language tag (default: en-US)
  --voices <a,b,c>        Comma-separated voice IDs
  --out <dir>             Output directory (default: scripts/generated-speech)
  --sample-rate <hz>      Audio sample rate (default: 44100)
  --bit-rate <bps>        Audio bit rate in bps (default: 128000)
  --api-key <key>         Override XAI_API_KEY
  -h, --help              Show this help`);
}

function readFlag(args, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }
  const index = args.indexOf(name);
  if (index === -1) return;
  return args[index + 1];
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const voicesFlag = readFlag(args, '--voices');
  const useNativeText = !voicesFlag;
  const voices = voicesFlag
    ? voicesFlag
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : DEFAULT_VOICES;

  if (voices.length === 0) {
    throw new Error('--voices must contain at least one voice ID');
  }

  const sampleRateFlag = readFlag(args, '--sample-rate');
  const sampleRate =
    sampleRateFlag === undefined ? 44_100 : Number(sampleRateFlag);
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error('--sample-rate must be a positive integer');
  }

  const bitRateFlag = readFlag(args, '--bit-rate');
  const bitRate = bitRateFlag === undefined ? 128_000 : Number(bitRateFlag);
  if (!Number.isInteger(bitRate) || bitRate <= 0) {
    throw new Error('--bit-rate must be a positive integer');
  }

  return {
    apiKey: readFlag(args, '--api-key') ?? process.env.XAI_API_KEY,
    bitRate,
    language: readFlag(args, '--language') ?? DEFAULT_LANGUAGE,
    outDir: path.resolve(
      readFlag(args, '--out') ?? path.join(scriptDir, 'generated-speech'),
    ),
    sampleRate,
    text: readFlag(args, '--text') ?? DEFAULT_TEXT,
    useNativeText,
    voices,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function generateForVoice(options, voiceId) {
  const voiceMeta = VOICE_MAP[voiceId];
  const displayName = voiceMeta?.display_name ?? voiceMeta?.name ?? voiceId;
  const basename = `${scriptStartedAt}-xai_${slugify(displayName)}`;
  const mp3Path = path.join(options.outDir, `${basename}.mp3`);

  const voiceLang = voiceMeta?.language;
  const text = options.useNativeText
    ? (LANGUAGE_TEXTS[voiceLang] ?? options.text)
    : options.text;
  const language = options.useNativeText
    ? (voiceLang ?? options.language)
    : options.language;

  console.log(`\n▶ Generating ${displayName} (${voiceId}, ${language})`);

  const res = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      output_format: {
        codec: 'mp3',
        sample_rate: options.sampleRate,
        bit_rate: options.bitRate,
      },
      language,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `TTS error for ${voiceId} (${res.status}): ${await res.text()}`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(mp3Path, buf);

  console.log(`  MP3: ${mp3Path}`);
  return { voiceId, mp3Path };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.apiKey) {
    throw new Error(
      'Missing XAI_API_KEY. Set it in your env or pass --api-key.',
    );
  }

  await mkdir(options.outDir, { recursive: true });

  console.log(`Generating ${options.voices.length} sample(s) via xAI TTS API`);
  console.log(`Language: ${options.language}`);
  console.log(`Output: ${options.outDir}`);

  const results = [];
  for (const voiceId of options.voices) {
    results.push(await generateForVoice(options, voiceId));
  }

  console.log('\nDone. Generated MP3 files:');
  for (const result of results) {
    console.log(`- ${result.voiceId}: ${result.mp3Path}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
