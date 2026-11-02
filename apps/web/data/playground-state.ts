import { defaultSessionConfig, instructions } from './default-config';
import type { Preset } from './presets';
import type { SessionConfig } from './session-config';

export type CallLanguage =
  | 'ar'
  | 'cs'
  | 'da'
  | 'de'
  | 'en'
  | 'es'
  | 'fi'
  | 'fr'
  | 'hi'
  | 'it'
  | 'ja'
  | 'ko'
  | 'nl'
  | 'no'
  | 'pl'
  | 'pt'
  | 'ru'
  | 'sv'
  | 'tr'
  | 'zh';

export const callLanguages: Array<{ value: CallLanguage; label: string }> = [
  { label: 'Arabic', value: 'ar' },
  { label: 'Czech', value: 'cs' },
  { label: 'Danish', value: 'da' },
  { label: 'German', value: 'de' },
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'Finnish', value: 'fi' },
  { label: 'French', value: 'fr' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Italian', value: 'it' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Norwegian', value: 'no' },
  { label: 'Polish', value: 'pl' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Russian', value: 'ru' },
  { label: 'Swedish', value: 'sv' },
  { label: 'Turkish', value: 'tr' },
  { label: 'Chinese (Mandarin)', value: 'zh' },
];

export const languageInitialInstructions: Record<CallLanguage, string> = {
  ar: 'SYSTEM: <breathy>قم بتحية المستخدم بطريقة فاتنة ومليئة بالمغازلة. إذا لم يتحدث المستخدم كثيرًا، كن استباقيًا وحاول إشراكه.</breathy>',
  cs: 'SYSTEM: <breathy>Pozdrav uživatele svůdným a koketním způsobem. Pokud uživatel moc nemluví, buď proaktivní a pokus se ho zapojit.</breathy>',
  da: 'SYSTEM: <breathy>Hils brugeren på en forførende og flirtende måde. Hvis brugeren ikke taler meget, vær proaktiv og prøv at få dem til at engagere sig.</breathy>',
  de: 'SYSTEM: <breathy>Begrüße den Nutzer auf verführerische und kokette Weise. Wenn der Nutzer nicht viel spricht, sei proaktiv und versuche ihn zum Engagement zu bewegen.</breathy>',
  en: 'SYSTEM: <breathy>Say hi to the user in a seductive and flirtatious manner. If the user is not talking much, be proactive and get them to engage.</breathy>',
  es: 'SYSTEM: <breathy>Saluda al usuario de manera seductora y coqueta. Si el usuario no habla mucho, sé proactivo e intenta que se comprometa.</breathy>',
  fi: 'SYSTEM: <breathy>Tervehdi käyttäjää viettelevällä ja flirttailevalla tavalla. Jos käyttäjä ei puhu paljon, ole proaktiivinen ja yritä saada hänet osallistumaan.</breathy>',
  fr: "SYSTEM: <breathy>Salue l'utilisateur d'une manière séduisante et aguicheuse. Si l'utilisateur ne parle pas beaucoup, sois proactif et essaie de le faire engager.</breathy>",
  hi: 'SYSTEM: <breathy>उपयोगकर्ता को मोहक और छेड़खानी भरे अंदाज़ में नमस्ते करो। अगर उपयोगकर्ता ज्यादा बात नहीं कर रहा है, तो सक्रिय रहो और उन्हें शामिल होने के लिए प्रेरित करो।</breathy>',
  it: "SYSTEM: <breathy>Saluta l'utente in modo seducente e civettuolo. Se l'utente non parla molto, sii proattivo e cerca di fargli partecipare.</breathy>",
  ja: 'SYSTEM: <breathy>誘惑的で艶っぽくユーザーに挨拶して。ユーザーがあまり話さない場合は、積極的に働きかけて関与させて。</breathy>',
  ko: 'SYSTEM: <breathy>사용자에게 요염하고 매혹적인 톤으로 인사해. 사용자가 말을 많이 하지 않으면 적극적으로 행동하여 참여하도록 유도해.</breathy>',
  nl: 'SYSTEM: <breathy>Begroet de gebruiker op een verleidelijke en flirtende manier. Als de gebruiker niet veel praat, wees proactief en probeer hem/haar in te schakelen.</breathy>',
  no: 'SYSTEM: <breathy>Hils brukeren på en forførende og flørtende måte. Hvis brukeren ikke snakker mye, vær proaktiv og prøv å få dem til å engasjere seg.</breathy>',
  pl: 'SYSTEM: <breathy>Przywitaj użytkownika w uwodzicielski i zalotny sposób. Jeśli użytkownik nie mówi wiele, bądź proaktywny i spróbuj go zaangażować.</breathy>',
  pt: 'SYSTEM: <breathy>Cumprimente o usuário de forma sedutora e provocante. Se o usuário não está falando muito, seja proativo e tente envolvê-lo.</breathy>',
  ru: 'SYSTEM: <breathy>Поздоровайся с пользователем соблазнительно и кокетливо. Если пользователь мало говорит, будь инициативным и попробуй его вовлечь.</breathy>',
  sv: 'SYSTEM: <breathy>Hälsa på användaren på ett förföriskt och flirtigt sätt. Om användaren inte pratar mycket, var proaktiv och försök få dem att engagera sig.</breathy>',
  tr: 'SYSTEM: <breathy>Kullanıcıyı baştan çıkarıcı ve flörtöz bir şekilde selamla. Eğer kullanıcı fazla konuşmuyorsa, proaktif ol ve onu katılımı sağlamaya çalış.</breathy>',
  zh: 'SYSTEM: <breathy>以诱惑又撩人的方式向用户问好。如果用户不太说话，要积极主动地让他们参与进来。</breathy>',
};

export const defaultLanguage: CallLanguage = 'en';

export interface PlaygroundState {
  /** User-created custom characters */
  customCharacters: Preset[];
  defaultPresets: Preset[];
  initialInstruction: string;
  instructions: string;
  language: CallLanguage;
  /** Long-term memory opt-in. When true, the agent remembers distilled facts
   * about the user across calls; off (default) stores nothing. */
  memory: boolean;
  sceneInstructions: string;
  selectedPresetId: string | null;
  selectedSceneId: string | null;
  sessionConfig: SessionConfig;
}

export const initialInstruction = languageInitialInstructions[defaultLanguage];

// Define the initial state
export const defaultPlaygroundState: PlaygroundState = {
  customCharacters: [],
  defaultPresets: [], // Now populated from DB via SSR props
  initialInstruction,
  instructions,
  language: defaultLanguage,
  memory: false,
  sceneInstructions: '',
  selectedPresetId: null,
  selectedSceneId: null,
  sessionConfig: { ...defaultSessionConfig },
};
