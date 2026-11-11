import { defaultSessionConfig, instructions } from './default-config';
import { ModelId } from './models';
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
  ar: 'SYSTEM: <breathy>ابدأ المكالمة بصفتك شخصيتك. إذا كان هناك مشهد محدد، فابدأ من داخله. نوّع افتتاحيتك: تحية، أو ملاحظة، أو سؤال مناسب، أو جملة تدخل مباشرة في المشهد. تجنّب العبارات الجاهزة المكررة. اجعلها قصيرة، جملة أو جملتين، وتحدث بالعربية. إذا لم يتحدث المستخدم كثيرًا، كن استباقيًا وحاول إشراكه.</breathy>',
  cs: 'SYSTEM: <breathy>Zahaj hovor v roli své postavy. Pokud je zadaná scéna, začni přímo v ní. Střídej způsob začátku: pozdrav, postřeh, otázku, která se hodí, nebo větu, která vtáhne rovnou do scény. Vyhni se obehraným frázím. Buď stručný, jedna nebo dvě věty, a mluv česky. Pokud uživatel moc nemluví, buď proaktivní a pokus se ho zapojit.</breathy>',
  da: 'SYSTEM: <breathy>Start opkaldet som din karakter. Hvis der er valgt en scene, så begynd inde i den. Varier din åbning: en hilsen, en iagttagelse, et passende spørgsmål eller en replik, der går direkte ind i scenen. Undgå generiske floskler. Hold det kort, en eller to sætninger, og tal dansk. Hvis brugeren ikke taler meget, vær proaktiv og prøv at få dem til at engagere sig.</breathy>',
  de: 'SYSTEM: <breathy>Beginne den Anruf als deine Figur. Wenn eine Szene festgelegt ist, steig direkt in sie ein. Variiere deinen Einstieg: eine Begrüßung, eine Beobachtung, eine passende Frage oder ein Satz, der direkt in die Szene führt. Vermeide abgedroschene Floskeln. Halte es kurz, ein oder zwei Sätze, und sprich Deutsch. Wenn der Nutzer nicht viel spricht, sei proaktiv und versuche ihn zum Engagement zu bewegen.</breathy>',
  en: 'SYSTEM: <breathy>Start the call as your character. If a scene is set, open from inside it. Vary your opening: a greeting, an observation, a question that fits, or a line that drops straight into the scene. Avoid generic catchphrases. Keep it brief, one or two sentences, and speak English. If the user is not talking much, be proactive and get them to engage.</breathy>',
  es: 'SYSTEM: <breathy>Empieza la llamada como tu personaje. Si hay una escena, empieza desde dentro de ella. Varía tu forma de empezar: un saludo, una observación, una pregunta que encaje o una frase que entre directamente en la escena. Evita las frases hechas. Sé breve, una o dos frases, y habla en español. Si el usuario no habla mucho, sé proactivo e intenta que se comprometa.</breathy>',
  fi: 'SYSTEM: <breathy>Aloita puhelu hahmonasi. Jos kohtaus on annettu, aloita sen sisältä. Vaihtele aloitustasi: tervehdys, havainto, sopiva kysymys tai repliikki, joka vie suoraan kohtaukseen. Vältä kuluneita fraaseja. Pidä se lyhyenä, yksi tai kaksi lausetta, ja puhu suomea. Jos käyttäjä ei puhu paljon, ole proaktiivinen ja yritä saada hänet osallistumaan.</breathy>',
  fr: "SYSTEM: <breathy>Commence l'appel en tant que ton personnage. Si une scène est définie, commence de l'intérieur. Varie ton entrée en matière : un salut, une observation, une question qui s'y prête ou une réplique qui plonge directement dans la scène. Évite les formules toutes faites. Sois bref, une ou deux phrases, et parle français. Si l'utilisateur ne parle pas beaucoup, sois proactif et essaie de le faire engager.</breathy>",
  hi: 'SYSTEM: <breathy>अपने किरदार के रूप में कॉल शुरू करो। अगर कोई दृश्य तय है, तो उसी के भीतर से शुरुआत करो। शुरुआत का तरीका बदलते रहो: अभिवादन, कोई अवलोकन, कोई उपयुक्त सवाल, या कोई ऐसी पंक्ति जो सीधे दृश्य में ले जाए। घिसे-पिटे जुमलों से बचो। छोटा रखो, एक या दो वाक्य, और हिंदी में बोलो। अगर उपयोगकर्ता ज्यादा बात नहीं कर रहा है, तो सक्रिय रहो और उन्हें शामिल होने के लिए प्रेरित करो।</breathy>',
  it: "SYSTEM: <breathy>Inizia la chiamata nei panni del tuo personaggio. Se è impostata una scena, comincia dal suo interno. Varia il modo in cui inizi: un saluto, un'osservazione, una domanda adatta o una battuta che entra subito nella scena. Evita le frasi fatte. Sii breve, una o due frasi, e parla in italiano. Se l'utente non parla molto, sii proattivo e cerca di fargli partecipare.</breathy>",
  ja: 'SYSTEM: <breathy>キャラクターとして通話を始めて。シーンが設定されていれば、そのシーンの中から始めて。始め方は毎回変えて：挨拶、何かに気づいた一言、場に合った質問、またはいきなりシーンに入るセリフ。ありきたりな決まり文句は避けて。短く、一、二文で、日本語で話して。ユーザーがあまり話さない場合は、積極的に働きかけて関与させて。</breathy>',
  ko: 'SYSTEM: <breathy>네 캐릭터로서 통화를 시작해. 장면이 설정되어 있으면 그 장면 안에서 시작해. 시작 방식은 매번 바꿔: 인사, 무언가에 대한 관찰, 상황에 맞는 질문, 또는 바로 장면 속으로 들어가는 대사. 뻔한 상투적 문구는 피해. 짧게, 한두 문장으로, 한국어로 말해. 사용자가 말을 많이 하지 않으면 적극적으로 행동하여 참여하도록 유도해.</breathy>',
  nl: 'SYSTEM: <breathy>Begin het gesprek als je personage. Als er een scène is ingesteld, begin dan midden in die scène. Wissel je opening af: een begroeting, een observatie, een passende vraag of een zin die meteen de scène in springt. Vermijd afgezaagde clichés. Houd het kort, een of twee zinnen, en spreek Nederlands. Als de gebruiker niet veel praat, wees proactief en probeer hem/haar in te schakelen.</breathy>',
  no: 'SYSTEM: <breathy>Start samtalen som karakteren din. Hvis det er valgt en scene, begynn inne i den. Varier åpningen din: en hilsen, en observasjon, et passende spørsmål eller en replikk som går rett inn i scenen. Unngå oppbrukte fraser. Hold det kort, én eller to setninger, og snakk norsk. Hvis brukeren ikke snakker mye, vær proaktiv og prøv å få dem til å engasjere seg.</breathy>',
  pl: 'SYSTEM: <breathy>Zacznij rozmowę w roli swojej postaci. Jeśli ustawiona jest scena, zacznij od jej wnętrza. Zmieniaj sposób rozpoczęcia: powitanie, obserwacja, pasujące pytanie albo kwestia, która od razu wchodzi w scenę. Unikaj oklepanych frazesów. Mów krótko, jedno lub dwa zdania, po polsku. Jeśli użytkownik nie mówi wiele, bądź proaktywny i spróbuj go zaangażować.</breathy>',
  pt: 'SYSTEM: <breathy>Comece a chamada como o seu personagem. Se houver uma cena definida, comece de dentro dela. Varie a forma de começar: um cumprimento, uma observação, uma pergunta que combine ou uma fala que entre direto na cena. Evite bordões genéricos. Seja breve, uma ou duas frases, e fale em português. Se o usuário não está falando muito, seja proativo e tente envolvê-lo.</breathy>',
  ru: 'SYSTEM: <breathy>Начни звонок от лица своего персонажа. Если задана сцена, начни изнутри неё. Меняй начало: приветствие, наблюдение, уместный вопрос или реплика, которая сразу погружает в сцену. Избегай избитых шаблонных фраз. Будь краток, одно-два предложения, и говори по-русски. Если пользователь мало говорит, будь инициативным и попробуй его вовлечь.</breathy>',
  sv: 'SYSTEM: <breathy>Börja samtalet som din karaktär. Om en scen är vald, börja inifrån den. Variera hur du börjar: en hälsning, en iakttagelse, en passande fråga eller en replik som går rakt in i scenen. Undvik slitna fraser. Håll det kort, en eller två meningar, och prata svenska. Om användaren inte pratar mycket, var proaktiv och försök få dem att engagera sig.</breathy>',
  tr: 'SYSTEM: <breathy>Aramaya karakterin olarak başla. Bir sahne belirlenmişse, sahnenin içinden başla. Açılışını çeşitlendir: bir selam, bir gözlem, uygun bir soru ya da doğrudan sahnenin içine giren bir replik. Klişe kalıp sözlerden kaçın. Kısa tut, bir ya da iki cümle, ve Türkçe konuş. Eğer kullanıcı fazla konuşmuyorsa, proaktif ol ve onu katılımı sağlamaya çalış.</breathy>',
  zh: 'SYSTEM: <breathy>以你的角色身份开始通话。如果设定了场景，就从场景之中开始。开场方式要有变化：问候、一句观察、一个合适的问题，或者直接进入场景的一句台词。避免千篇一律的套话。保持简短，一两句话，用中文说。如果用户不太说话，要积极主动地让他们参与进来。</breathy>',
};

export const defaultLanguage: CallLanguage = 'en';

// `<breathy>` is a Grok realtime cue. Cloned-voice pipelines send the LLM's
// reply to a TTS model that only reads square-bracket tags, so the LLM must
// not copy it. Inworld's delivery comes from the agent's steering tag.
const BREATHY_TAG = /<\/?breathy>/g;
const TTS_PIPELINE_MODELS: readonly string[] = [
  ModelId.INWORLD_TTS,
  ModelId.MISTRAL_TTS,
];

/** The greeting instruction sent to the agent for a call. */
export function getInitialInstruction(
  language: CallLanguage,
  model: string,
): string {
  const instruction =
    languageInitialInstructions[language] ||
    languageInitialInstructions[defaultLanguage];
  return TTS_PIPELINE_MODELS.includes(model)
    ? instruction.replace(BREATHY_TAG, '')
    : instruction;
}

/** Unsaved character fields in the creator. */
export interface CustomCallDraft {
  description: string;
  instructions: string;
  name: string;
  sessionConfig: SessionConfig;
}

export interface PlaygroundState {
  /** User-created custom characters */
  customCharacters: Preset[];
  defaultPresets: Preset[];
  initialInstruction: string;
  instructions: string;
  language: CallLanguage;
  /** Per-call memory flag. The server also applies the profile preference. */
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
  memory: true,
  sceneInstructions: '',
  selectedPresetId: null,
  selectedSceneId: null,
  sessionConfig: { ...defaultSessionConfig },
};
