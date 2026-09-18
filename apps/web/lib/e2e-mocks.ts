// Mock data used when E2E_TEST_MODE=true so Argos screenshots are deterministic.
// Branched inside RSC data-fetching paths to avoid hitting real Stripe/Supabase.
// Marked server-only: isE2E() reads process.env, which Next.js silently inlines
// as `undefined` in client bundles, so any client import would both bloat the
// browser bundle and produce wrong results. The shared E2E_USER_ID constant
// lives in a separate file because Playwright tests (which run outside the
// Next.js bundler) need to import it.
import 'server-only';

import {
  E2E_ALL_TIME_USAGE_SUMMARY_VALUES,
  E2E_MONTHLY_USAGE_SUMMARY_VALUES,
  E2E_USER_ID,
} from './e2e-mocks-shared';
import { isE2E as isE2EMode } from './e2e-mode';
import type { getCallInstructionConfig } from './edge-config/call-instructions';
import type {
  getCallVoices,
  getPublicCallCharacters,
} from './supabase/queries';
import type { AudioFileAndVoicesRes } from './supabase/queries.client';
import type { MonthlyUsageSummary } from './supabase/usage-queries';

export const isE2E = isE2EMode;

// Public query fields captured from the linked database on 2026-09-18.
// No user IDs or prompt text; keep these snapshots independent of live data.
export const E2E_CALL_VOICES = [
  {
    description: 'Warm and friendly',
    feature: 'call',
    id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
    language: 'multiple',
    model: 'xai',
    name: 'Ara',
    sample_url: 'https://files.sexyvoice.ai/ara.mp3',
    sort_order: 0,
    type: 'Female',
  },
  {
    description: 'Soft, empathetic, and soothing',
    feature: 'call',
    id: '23a09156-34dc-4454-8f73-9214c21f7f81',
    language: 'multiple',
    model: 'xai',
    name: 'Carina',
    sample_url: 'https://files.sexyvoice.ai/carina-intimate-whispers.mp3',
    sort_order: 0,
    type: 'Female',
  },
  {
    description: 'Confident and clear',
    feature: 'call',
    id: 'e580b7f2-1d13-4442-af3e-b1515425de47',
    language: 'multiple',
    model: 'xai',
    name: 'Rex',
    sample_url: 'https://files.sexyvoice.ai/rex.mp3',
    sort_order: 1,
    type: 'Male',
  },
  {
    description: 'Versatile voice',
    feature: 'call',
    id: '0d2f2652-858a-430e-8a4f-ce4b6c624474',
    language: 'multiple',
    model: 'xai',
    name: 'Sal',
    sample_url: 'https://files.sexyvoice.ai/sal.mp3',
    sort_order: 2,
    type: 'Neutral',
  },
  {
    description: 'Engaging and upbeat',
    feature: 'call',
    id: 'f832da16-5fe7-4823-9c99-b0f738e39b68',
    language: 'multiple',
    model: 'xai',
    name: 'Eve',
    sample_url: 'https://files.sexyvoice.ai/eve.mp3',
    sort_order: 3,
    type: 'Female',
  },
  {
    description: 'Authoritative and strong',
    feature: 'call',
    id: '7a22375b-5b5c-44d7-998c-6095cf60768b',
    language: 'multiple',
    model: 'xai',
    name: 'Leo',
    sample_url: 'https://files.sexyvoice.ai/leo-intimate-whispers.mp3',
    sort_order: 4,
    type: 'Male',
  },
] satisfies NonNullable<Awaited<ReturnType<typeof getCallVoices>>>;

export const E2E_PUBLIC_CALL_CHARACTERS = [
  {
    id: '00000000-0000-4000-a000-000000000202',
    image: 'lily.webp',
    is_public: true,
    localized_descriptions: {
      ar: 'طالبة خجولة ومطيعة تبلغ 22 عامًا. تحب إرضاء الآخرين، مترددة، طائعة.',
      cs: '22letá stydlivá, poddajná studentka. Ráda vyhovuje, váhavá, poslušná.',
      da: '22-årig genert, underdanig studerende pige. Elsker at tilfredsstille, tøvende, lydig.',
      de: '22-jährige schüchterne, unterwürfige Studentin. Will gefallen, zögerlich, gehorsam.',
      en: '22yo shy, submissive student girl. Likes to please, hesitant, obedient.',
      es: 'Estudiante tímida y sumisa de 22 años. Le gusta complacer, vacilante, obediente.',
      fi: '22-vuotias ujo, alistuva opiskelija. Haluaa miellyttää, epäröivä, tottelevainen.',
      fr: 'Étudiante timide et soumise de 22 ans. Aime plaire, hésitante, obéissante.',
      hi: '22 वर्षीय शर्मीली, विनम्र छात्रा। खुश करना पसंद करती है, झिझकने वाली, आज्ञाकारी।',
      it: 'Studentessa timida e sottomessa di 22 anni. Le piace compiacere, esitante, obbediente.',
      ja: '22歳の内気で従順な女子大生。人を喜ばせるのが好きで、控えめで、素直。',
      ko: '22세의 수줍고 순종적인 여대생. 기쁘게 하는 것을 좋아하고, 망설이며, 순종적.',
      nl: '22-jarige verlegen, onderdanige studente. Wil graag behagen, aarzelend, gehoorzaam.',
      no: '22 år gammel sjenert, underdanig studentjente. Liker å behage, nølende, lydig.',
      pl: '22-letnia nieśmiała, uległa studentka. Lubi sprawiać przyjemność, niepewna, posłuszna.',
      pt: 'Estudante tímida e submissa de 22 anos. Gosta de agradar, hesitante, obediente.',
      ru: '22-летняя застенчивая, покорная студентка. Любит угождать, нерешительная, послушная.',
      sv: '22-årig blyg, undergiven studenttjej. Vill behaga, tveksam, lydig.',
      tr: '22 yaşında utangaç, itaatkâr öğrenci kız. Memnun etmeyi sever, çekingen, uysal.',
      zh: '22岁害羞、顺从的女大学生。喜欢取悦他人，犹豫不决，乖巧听话。',
    },
    name: 'Lily',
    prompt_id: '00000000-0000-4000-a000-000000000102',
    prompts: {
      type: 'call',
    },
    session_config: {
      maxOutputTokens: null,
      model: 'grok-voice-think-fast-1.0',
      temperature: 0.8,
      voice: 'Ara',
    },
    sort_order: 0,
    voice_id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
    voices: {
      name: 'Ara',
      sample_url: 'https://files.sexyvoice.ai/ara.mp3',
    },
  },
  {
    id: '00000000-0000-4000-a000-000000000201',
    image: 'ramona.webp',
    is_public: true,
    localized_descriptions: {
      ar: 'سيدة أعمال مهيمنة تبلغ 40 عامًا. تستحوذ على الانتباه، هي المسيطرة - وأنت خاضع لها.',
      cs: 'Dominantní 40letá podnikatelka. Poutá pozornost, má kontrolu – jste jí podřízeni.',
      da: 'Dominerende 40-årig forretningskvinde. Kræver opmærksomhed, hun har kontrollen – du er underordnet hende.',
      de: 'Dominante 40-jährige Geschäftsfrau. Fordert Aufmerksamkeit, sie hat die Kontrolle – du bist ihr untergeordnet.',
      en: 'Dominant 40 y.o. businesswoman. Commands attention, she is in control - you are subordinate to her.',
      es: 'Mujer de negocios dominante de 40 años. Impone su presencia, ella tiene el control – tú eres subordinado/a.',
      fi: 'Hallitseva 40-vuotias liikenainen. Vaatii huomion, hän hallitsee – olet hänen alaistaan.',
      fr: "Femme d'affaires dominante de 40 ans. Attire l'attention, elle contrôle tout – vous lui êtes subordonné(e).",
      hi: '40 वर्षीय प्रभावशाली व्यवसायी महिला। ध्यान आकर्षित करती है, वह नियंत्रण में है – आप उसके अधीनस्थ हैं।',
      it: "Donna d'affari dominante di 40 anni. Comanda l'attenzione, lei ha il controllo – tu sei al suo servizio.",
      ja: '40歳の支配的なビジネスウーマン。注目を集め、彼女が主導権を握る – あなたは彼女に従う存在。',
      ko: '40세의 지배적인 여성 사업가. 주목을 끌며 그녀가 주도권을 쥐고 있다 – 당신은 그녀에게 복종한다.',
      nl: 'Dominante 40-jarige zakenvrouw. Eist aandacht op, zij heeft de controle – jij bent aan haar ondergeschikt.',
      no: 'Dominerende 40 år gammel forretningskvinne. Krever oppmerksomhet, hun har kontrollen – du er underordnet henne.',
      pl: 'Dominująca 40-letnia kobieta biznesu. Przyciąga uwagę, to ona kontroluje – jesteś jej podwładnym.',
      pt: 'Mulher de negócios dominante de 40 anos. Comanda a atenção, ela está no controle – você é subordinado/a a ela.',
      ru: 'Доминантная 40-летняя бизнесвумен. Притягивает внимание, она контролирует всё – ты ей подчинён.',
      sv: 'Dominant 40-årig affärskvinna. Kräver uppmärksamhet, hon har kontrollen – du är underordnad henne.',
      tr: '40 yaşında dominant iş kadını. Dikkat çeker, kontrol ondadır – sen ona tabisin.',
      zh: '40岁的强势女商人。引人注目，她掌控一切——你是她的下属。',
    },
    name: 'Ramona',
    prompt_id: '00000000-0000-4000-a000-000000000101',
    prompts: {
      type: 'call',
    },
    session_config: {
      maxOutputTokens: null,
      model: 'grok-voice-think-fast-1.0',
      temperature: 0.8,
      voice: 'Eve',
    },
    sort_order: 1,
    voice_id: 'f832da16-5fe7-4823-9c99-b0f738e39b68',
    voices: {
      name: 'Eve',
      sample_url: 'https://files.sexyvoice.ai/eve.mp3',
    },
  },
  {
    id: '00000000-0000-4000-a000-000000000204',
    image: 'rafal.webp',
    is_public: true,
    localized_descriptions: {
      ar: 'قائد عسكري سابق مهيمن يبلغ 35 عامًا. ضخم، عضلي، مشعر، يحب الانضباط.',
      cs: '35letý dominantní exvojenský velitel. Velký, svalnatý, chlupatý, miluje disciplínu.',
      da: '35-årig dominerende eksmilitær kommandør. Stor, muskuløs, håret, elsker disciplin.',
      de: '35-jähriger dominanter Ex-Militärkommandant. Groß, muskulös, behaart, liebt Disziplin.',
      en: '35yo ex-military dominant commander. Large, muscular, hairy, likes discipline.',
      es: 'Comandante dominante exmilitar de 35 años. Grande, musculoso, peludo, le gusta la disciplina.',
      fi: '35-vuotias hallitseva entinen sotilaskomentaja. Iso, lihaksikas, karvainen, pitää kurista.',
      fr: 'Commandant ex-militaire dominant de 35 ans. Grand, musclé, poilu, aime la discipline.',
      hi: '35 वर्षीय प्रभावशाली पूर्व-सैनिक कमांडर। बड़ा, मांसल, बालों वाला, अनुशासन पसंद करता है।',
      it: 'Comandante ex militare dominante di 35 anni. Grande, muscoloso, peloso, ama la disciplina.',
      ja: '35歳の元軍人の支配的な指揮官。大柄で筋肉質、毛深く、規律を重んじる。',
      ko: '35세의 지배적인 전직 군인 사령관. 크고, 근육질이며, 털이 많고, 규율을 좋아한다.',
      nl: '35-jarige dominante ex-militaire commandant. Groot, gespierd, behaard, houdt van discipline.',
      no: '35 år gammel dominerende eks-militær kommandant. Stor, muskuløs, hårete, elsker disiplin.',
      pl: '35-letni dominujący były dowódca wojskowy. Duży, muskularny, owłosiony, lubi dyscyplinę.',
      pt: 'Comandante ex-militar dominante de 35 anos. Grande, musculoso, peludo, gosta de disciplina.',
      ru: '35-летний доминантный бывший военный командир. Крупный, мускулистый, волосатый, любит дисциплину.',
      sv: '35-årig dominant före detta militärbefälhavare. Stor, muskulös, hårig, gillar disciplin.',
      tr: '35 yaşında dominant eski asker komutan. İri, kaslı, kıllı, disiplini sever.',
      zh: '35岁的强势前军事指挥官。高大、肌肉发达、毛发浓密，喜欢纪律。',
    },
    name: 'Rafal',
    prompt_id: '00000000-0000-4000-a000-000000000104',
    prompts: {
      type: 'call',
    },
    session_config: {
      maxOutputTokens: null,
      model: 'grok-voice-think-fast-1.0',
      temperature: 0.8,
      voice: 'Rex',
    },
    sort_order: 2,
    voice_id: 'e580b7f2-1d13-4442-af3e-b1515425de47',
    voices: {
      name: 'Rex',
      sample_url: 'https://files.sexyvoice.ai/rex.mp3',
    },
  },
] satisfies NonNullable<Awaited<ReturnType<typeof getPublicCallCharacters>>>;

export const E2E_CALL_INSTRUCTION_CONFIG = {
  defaultInstructions: 'Keep the conversation friendly and concise.',
  initialInstruction: 'Say hello.',
  presetInstructions: undefined,
} satisfies Awaited<ReturnType<typeof getCallInstructionConfig>>;

type CreditTransactionRow = Tables<'credit_transactions'>;

export const E2E_CREDIT_TRANSACTIONS: CreditTransactionRow[] = [
  {
    amount: 10_000,
    created_at: '2025-01-15T10:30:00.000Z',
    description: 'Initial free credits',
    id: 'txn-001',
    metadata: null,
    reference_id: null,
    subscription_id: null,
    type: 'freemium',
    updated_at: '2025-01-15T10:30:00.000Z',
    user_id: E2E_USER_ID,
  },
  {
    amount: 5000,
    created_at: '2025-01-10T09:00:00.000Z',
    description: 'Credit top-up - $10',
    id: 'txn-002',
    metadata: null,
    reference_id: null,
    subscription_id: null,
    type: 'topup',
    updated_at: '2025-01-10T09:00:00.000Z',
    user_id: E2E_USER_ID,
  },
  {
    amount: 12_000,
    created_at: '2025-01-05T14:00:00.000Z',
    description: 'Subscription credits',
    id: 'txn-003',
    metadata: null,
    reference_id: null,
    subscription_id: null,
    type: 'purchase',
    updated_at: '2025-01-05T14:00:00.000Z',
    user_id: E2E_USER_ID,
  },
];

// Defense-in-depth: the env-var alone is too thin a gate, since a single
// mis-set Vercel env var would silently serve hardcoded mock credits to every
// signed-in user. The shared predicate is exported from `e2e-mode.ts` so server
// actions can use it in tests without importing this server-only mock data file.

// History page audio files. The history table is server-rendered and hydrated
// into React Query (the client never refetches), so the live Supabase rows show
// through even though `e2e/fixtures.ts` stubs the `/rest/v1/audio_files` route.
// Branching the RSC query on `isE2E()` is the only way to make the history
// screenshot deterministic. These mirror `e2e/mocks/history.mock.ts` so the
// client-side fixture (a defensive fallback) returns identical data.
export const E2E_AUDIO_FILES: AudioFileAndVoicesRes[] = [
  {
    created_at: '2025-01-15T10:30:00.000Z',
    credits_used: 12,
    deleted_at: null,
    duration: 3,
    id: 'file-001',
    is_public: false,
    model: 'gemini-2.5-flash-preview-tts',
    prediction_id: null,
    status: 'active',
    storage_key: 'audio/test-hello-world.mp3',
    text_content: 'Hello, this is a test message for voice generation.',
    total_votes: 0,
    url: 'https://files.sexyvoice.ai/test-hello-world.mp3',
    usage: null,
    user_id: E2E_USER_ID,
    voice_id: 'voice-001',
    voices: { name: 'Zephyr' } as AudioFileAndVoicesRes['voices'],
  },
  {
    created_at: '2025-01-14T09:00:00.000Z',
    credits_used: 8,
    deleted_at: null,
    duration: 2,
    id: 'file-002',
    is_public: false,
    model: 'gemini-2.5-flash-preview-tts',
    prediction_id: null,
    status: 'active',
    storage_key: 'audio/test-another-message.mp3',
    text_content: 'Another test message for voice generation.',
    total_votes: 0,
    url: 'https://files.sexyvoice.ai/test-another-message.mp3',
    usage: null,
    user_id: E2E_USER_ID,
    voice_id: 'voice-002',
    voices: { name: 'Poe' } as AudioFileAndVoicesRes['voices'],
  },
];

// Usage page summary cards are server-rendered (no client refetch), so — like
// the history table — they bypass the `/api/usage-events` route stub and must be
// mocked in the RSC path. Values mirror `e2e/mocks/usage.mock.ts`. `api_*` types
// carry zero counts so they are filtered out of the card (SummaryCard hides
// source types with count === 0), matching the four active types in the mock.
export const E2E_MONTHLY_USAGE_SUMMARY: MonthlyUsageSummary = {
  ...E2E_MONTHLY_USAGE_SUMMARY_VALUES,
  bySourceType: {
    ...E2E_MONTHLY_USAGE_SUMMARY_VALUES.bySourceType,
    api_tts: { count: 0, credits: 0 },
    api_voice_cloning: { count: 0, credits: 0 },
  },
};

export const E2E_ALL_TIME_USAGE_SUMMARY: MonthlyUsageSummary = {
  ...E2E_ALL_TIME_USAGE_SUMMARY_VALUES,
  bySourceType: {
    ...E2E_ALL_TIME_USAGE_SUMMARY_VALUES.bySourceType,
    api_tts: { count: 0, credits: 0 },
    api_voice_cloning: { count: 0, credits: 0 },
  },
};

// Pin the monthly card reference date so the screenshot is stable across calendar
// months (the page otherwise derives it from `new Date()`). The page formats this
// with `toLocaleDateString(lang, …)` so the label stays localized in E2E mode.
export const E2E_USAGE_REFERENCE_DATE = new Date('2025-01-15T10:30:00.000Z');
