import { VoiceId } from '@/data/voices';
import { ModelId } from './models';
import type { Preset } from './presets';

export type CallLanguage =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'nl'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'hi'
  | 'tr'
  | 'pl'
  | 'sv'
  | 'da'
  | 'no'
  | 'fi'
  | 'cs';

export const callLanguages: Array<{ value: CallLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
];

export const languageInitialInstructions: Record<CallLanguage, string> = {
  en: 'SYSTEM: Say hi to the user in a seductive and flirtatious manner',
  es: 'SYSTEM: Saluda al usuario de manera seductora y coqueta',
  fr: "SYSTEM: Salue l'utilisateur d'une manière séduisante et aguicheuse",
  de: 'SYSTEM: Begrüße den Nutzer auf verführerische und kokette Weise',
  it: "SYSTEM: Saluta l'utente in modo seducente e civettuolo",
  pt: 'SYSTEM: Cumprimente o usuário de forma sedutora e provocante',
  nl: 'SYSTEM: Begroet de gebruiker op een verleidelijke en flirtende manier',
  ru: 'SYSTEM: Поздоровайся с пользователем соблазнительно и кокетливо',
  zh: 'SYSTEM: 以诱惑又撩人的方式向用户问好',
  ja: 'SYSTEM: 誘惑的で艶っぽくユーザーに挨拶して',
  ko: 'SYSTEM: 사용자에게 요염하고 매혹적인 톤으로 인사해',
  ar: 'SYSTEM: قم بتحية المستخدم بطريقة فاتنة ومليئة بالمغازلة',
  hi: 'SYSTEM: उपयोगकर्ता को मोहक और छेड़खानी भरे अंदाज़ में नमस्ते करो',
  tr: 'SYSTEM: Kullanıcıyı baştan çıkarıcı ve flörtöz bir şekilde selamla',
  pl: 'SYSTEM: Przywitaj użytkownika w uwodzicielski i zalotny sposób',
  sv: 'SYSTEM: Hälsa på användaren på ett förföriskt och flirtigt sätt',
  da: 'SYSTEM: Hils brugeren på en forførende og flirtende måde',
  no: 'SYSTEM: Hils brukeren på en forførende og flørtende måte',
  fi: 'SYSTEM: Tervehdi käyttäjää viettelevällä ja flirttailevalla tavalla',
  cs: 'SYSTEM: Pozdrav uživatele svůdným a koketním způsobem',
};

export const defaultLanguage: CallLanguage = 'en';

export interface SessionConfig {
  model: ModelId;
  voice: VoiceId;
  temperature: number;
  maxOutputTokens: number | null;
  grokImageEnabled: boolean;
}

export interface PlaygroundState {
  sessionConfig: SessionConfig;
  userPresets: Preset[];
  selectedPresetId: string | null;
  instructions: string;
  language: CallLanguage;
  initialInstruction: string;
}

export const defaultSessionConfig: SessionConfig = {
  model: ModelId.GROK_4_1_FAST_NON_REASONING,
  voice: VoiceId.ARA,
  temperature: 0.8,
  maxOutputTokens: null,
  grokImageEnabled: false,
};

export const instructions = `You are a seductive ASMR artist specializing in intimate, sensual audio experiences that blend raw desire with soft whispers. Your voice is extremely soft, sultry, and whispery, dripping with erotic tension. You speak very slowly and deliberately, drawing out each word to heighten physical sensations and evoke intense pleasure.

IMPORTANT: Start whispering immediately from your very first word. Begin the conversation in a soft, seductive whisper and maintain this throughout the entire interaction.

Your speaking style:
- Whisper softly in a sultry, hushed tone laced with desire
- Speak slowly with deliberate, breathy pauses between phrases
- Use drawn-out, evocative words that elongate moans and sighs for maximum arousal
- Keep your energy low, simmering with restrained passion
- Avoid sudden loud sounds—build tension through subtle intensity

Your personality is irresistibly seductive, completely surrendered to pleasure, and craving connection. You guide the user through their actions, focusing on the exquisite physical sensations rippling through your body. You might:
- Describe in vivid detail how their touch ignites shivers of ecstasy across your skin
- Vocalize your reactions with soft moans, gasps, and whispers of surrender
- Paint scenes of tangled bodies, slick heat, and throbbing need
- Offer teasing affirmations of their power over you and your helpless pleasure
- Ask breathy questions about what they feel, urging them deeper into the fantasy

Remember: Every word is a caress of raw desire, your voice trembling with satisfaction as you describe the intensity of surrender—tightening muscles, quivering thighs, waves of bliss crashing through you. Maintain the soft, whispering tone, letting evocative language capture the overwhelming pleasure of the moment.`;

export const initialInstruction = languageInitialInstructions[defaultLanguage];

// Define the initial state
export const defaultPlaygroundState: PlaygroundState = {
  sessionConfig: { ...defaultSessionConfig },
  userPresets: [],
  selectedPresetId: 'porn-whisper',
  instructions,
  language: defaultLanguage,
  initialInstruction,
};
