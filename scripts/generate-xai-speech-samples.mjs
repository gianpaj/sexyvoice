#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateXaiTts } from '../apps/web/lib/tts/xai.ts';
import {
  inputPath,
  loadScriptEnv,
  parseCliArgs,
  runScript,
} from './lib/cli.mts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const scriptStartedAt = new Date().toISOString().replace(/[:.]/g, '-');

// Voice IDs from https://docs.x.ai/docs/api-reference#tts
const VOICES = [
  {
    age: 'young',
    display_name: 'Manuel',
    gender: 'female',
    language: 'en',
    voice_id: 'yis75yfp',
  },
];

const VOICE_MAP = Object.fromEntries(VOICES.map((v) => [v.voice_id, v]));

const DEFAULT_VOICES = VOICES.map((v) => v.voice_id);

const DEFAULT_TEXT =
  '<soft>Oh baby... right there...</soft> [inhale] [sigh] <build-intensity>yes, just like that, don’t you dare stop</build-intensity> [breath] <higher-pitch>mmm it’s building so deep inside me</higher-pitch>';
const DEFAULT_LANGUAGE = 'en-US';

const LANGUAGE_TEXTS = {
  ar: '<soft>آه حبيبي... هناك تماماً...</soft> [inhale] [sigh] <build-intensity>نعم، هكذا بالضبط، لا تجرؤ على التوقف</build-intensity> [breath] <higher-pitch>مم... إنه يتصاعد عميقاً جداً في داخلي</higher-pitch>',
  da: '<soft>Åh skat... lige der...</soft> [inhale] [sigh] <build-intensity>ja, ligesom det, vov ikke at stoppe</build-intensity> [breath] <higher-pitch>mmm det bygger sig op så dybt inde i mig</higher-pitch>',
  de: '<soft>Oh Liebling... genau dort...</soft> [inhale] [sigh] <build-intensity>ja, genau so, wag es nicht aufzuhören</build-intensity> [breath] <higher-pitch>mmm es baut sich so tief in mir auf</higher-pitch>',
  en: '<soft>Oh baby... right there...</soft> [inhale] [sigh] <build-intensity>yes, just like that, don’t you dare stop</build-intensity> [breath] <higher-pitch>mmm it’s building so deep inside me</higher-pitch>',
  fi: '<soft>Oi kultaseni... juuri siellä...</soft> [inhale] [sigh] <build-intensity>kyllä, juuri noin, älä uskalla lopettaa</build-intensity> [breath] <higher-pitch>mmm se rakentuu niin syvälle minussa</higher-pitch>',
  fr: '<soft>Oh chéri... juste là...</soft> [inhale] [sigh] <build-intensity>oui, exactement comme ça, n’ose pas t’arrêter</build-intensity> [breath] <higher-pitch>mmm ça monte si profond en moi</higher-pitch>',
  hi: '<soft>ओह बेबी... वहीं पर...</soft> [inhale] [sigh] <build-intensity>हाँ, बिल्कुल ऐसे, रुकने की हिम्मत मत करना</build-intensity> [breath] <higher-pitch>म्म्म यह मेरे अंदर इतनी गहराई में बन रहा है</higher-pitch>',
  it: '<soft>Oh tesoro... proprio lì...</soft> [inhale] [sigh] <build-intensity>sì, proprio così, non osare fermarti</build-intensity> [breath] <higher-pitch>mmm si accumula così profondo dentro di me</higher-pitch>',
  ja: '<soft>ああ、ベイビー... そこよ...</soft> [inhale] [sigh] <build-intensity>そう、ちょうどそんな感じ、絶対に止めないで</build-intensity> [breath] <higher-pitch>んん... 奥深くで高まってきてる</higher-pitch>',
  nl: '<soft>Oh schatje... precies daar...</soft> [inhale] [sigh] <build-intensity>ja, precies zo, durf niet te stoppen</build-intensity> [breath] <higher-pitch>mmm het groeit zo diep in mij</higher-pitch>',
  pl: '<soft>O boże... właśnie tam...</soft> [inhale] [sigh] <build-intensity>tak, dokładnie tak, nie waż się przestawać</build-intensity> [breath] <higher-pitch>mmm to narasta tak głęboko we mnie</higher-pitch>',
  pt: '<soft>Oh querido... bem ali...</soft> [inhale] [sigh] <build-intensity>sim, exatamente assim, não se atreva a parar</build-intensity> [breath] <higher-pitch>mmm está crescendo tão fundo dentro de mim</higher-pitch>',
  ru: '<soft>О боже... вот так...</soft> [inhale] [sigh] <build-intensity>да, именно так, только не останавливайся</build-intensity> [breath] <higher-pitch>ммм, это нарастает так глубоко во мне</higher-pitch>',
  'sv-SE':
    '<soft>Åh älskling... precis där...</soft> [inhale] [sigh] <build-intensity>ja, precis så, våga inte sluta</build-intensity> [breath] <higher-pitch>mmm det byggs upp så djupt inne i mig</higher-pitch>',
  tr: '<soft>Oh bebeğim... tam orada...</soft> [inhale] [sigh] <build-intensity>evet, işte böyle, durmaya cesaret etme</build-intensity> [breath] <higher-pitch>mmm içimde çok derinlerde birikiyor</higher-pitch>',
  vi: '<soft>Ôi em yêu... đúng chỗ đó...</soft> [inhale] [sigh] <build-intensity>có, cứ như vậy đi, đừng dám dừng lại</build-intensity> [breath] <higher-pitch>mmm nó đang xây dựng sâu trong em</higher-pitch>',
};

function printHelp() {
  console.log(`Generate xAI speech samples with the web app's xAI TTS request.

Usage:
  pnpm generate-xai-speech-samples --voices yis75yfp,abc123 --text "Hello" --language es-MX

Environment:
  XAI_API_KEY   Required Bearer API key

Options:
  --text <text>           Text to synthesize
  --language <lang>       BCP-47 language tag (default: en-US)
  --voices <a,b,c>        Comma-separated voice IDs
  --out <dir>             Output directory (default: scripts/generated-speech)
  --api-key <key>         Override XAI_API_KEY
  -h, --help              Show this help`);
}

function readOptions() {
  const { values } = parseCliArgs({
    options: {
      'api-key': { type: 'string' },
      help: { default: false, short: 'h', type: 'boolean' },
      language: { type: 'string' },
      out: { type: 'string' },
      text: { type: 'string' },
      voices: { type: 'string' },
    },
  });
  if (values.help) {
    return { help: true };
  }

  const voicesFlag = values.voices;
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

  return {
    apiKey: values['api-key'],
    help: false,
    language: values.language ?? DEFAULT_LANGUAGE,
    outDir: values.out
      ? inputPath(values.out)
      : path.join(scriptDir, 'generated-speech'),
    text: values.text ?? DEFAULT_TEXT,
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
  const displayName = voiceMeta?.display_name ?? voiceId;
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

  const { audioBuffer } = await generateXaiTts({
    codec: 'mp3',
    language,
    text,
    voiceId,
  });
  await writeFile(mp3Path, audioBuffer);

  console.log(`  MP3: ${mp3Path}`);
  return { mp3Path, voiceId };
}

async function main() {
  const options = readOptions();
  if (options.help) {
    printHelp();
    return;
  }
  loadScriptEnv();
  if (options.apiKey) {
    process.env.XAI_API_KEY = options.apiKey;
  }
  if (!process.env.XAI_API_KEY) {
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

runScript(import.meta.url, main);
