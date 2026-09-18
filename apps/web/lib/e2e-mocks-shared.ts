// Plain fixtures safe to import from RSC, client code, and Playwright.
// Server-only state and fixtures live in `./e2e-mocks.ts`.
import type { getPublicCallCharacters } from './supabase/queries';
export const E2E_USER_ID = 'e2e-test-user-id';

// Single source of truth for the E2E usage-summary numbers. The server-side
// summary cards (`./e2e-mocks.ts`) and the client-side data-table mock
// (`e2e/mocks/usage.mock.ts`) both build from these so they can never drift
// apart and make the screenshot disagree with the table. The server side adds
// zero-count `api_*` entries (required by its `Record<UsageSourceType>` type;
// `SummaryCard` filters out count === 0, so they never render).
export const E2E_MONTHLY_USAGE_SUMMARY_VALUES = {
  bySourceType: {
    audio_processing: { count: 1, credits: 5 },
    live_call: { count: 1, credits: 30 },
    tts: { count: 2, credits: 36 },
    voice_cloning: { count: 1, credits: 50 },
  },
  totalCredits: 121,
  totalOperations: 5,
};

export const E2E_ALL_TIME_USAGE_SUMMARY_VALUES = {
  bySourceType: {
    audio_processing: { count: 2, credits: 22 },
    live_call: { count: 6, credits: 120 },
    tts: { count: 12, credits: 250 },
    voice_cloning: { count: 3, credits: 150 },
  },
  totalCredits: 542,
  totalOperations: 23,
};

// Public character query snapshot from 2026-09-18, without user IDs or prompt text.
// Shared by server rendering and Playwright screenshot expectations.
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
