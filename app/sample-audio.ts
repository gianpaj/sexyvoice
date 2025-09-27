import type { Locale } from '@/lib/i18n/i18n-config';

type SampleAudio = {
  id: number;
  name: string;
  prompt: string;
  audioSrc: string;
  showOnSiteLangs: Locale[];
};

const sampleAudios: ReadonlyArray<SampleAudio> = [
  // {
  //   id: 1,
  //   name: 'Tara',
  //   prompt:
  //     "Life is like a box of chocolates, you never know what you're gonna get.",
  //   audioSrc: '/audios/tara_20250320_130636.mp3',
  // },
  {
    id: 2,
    name: 'Tara (en-US) 🇺🇸',
    prompt: '<sigh> Oh my god <groan>. That was amazing! <gasp>',
    audioSrc: 'tara_amazing.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
  },
  {
    id: 3,
    name: 'Kore (Multi-lingual) 🇩🇪',
    prompt:
      'uhhh jaaaa komm wir lecken uns in der neunundsechzig. saug mir die fotze aus. ja komm ohhhh uuuhhhhaa mmhhhhhh mhhhhh mmmmm uhhhh ohhhhuh  ohhhhhhhhhhhh',
    audioSrc: 'kore-a9f62355.mp3',
    showOnSiteLangs: ['en', 'de'],
  },
  {
    id: 4,
    name: 'Dan (en-UK) 🇬🇧',
    prompt: `Alright, so, uhm, <chuckle> why do dogs run in circles before they lie down? <pause>
Because it's hard to lay down in a square! <laugh>
I mean, imagine a dog just trying to plop down in perfect 90-degree angles. <snicker> Pure chaos!`,
    audioSrc: 'dan_joke.mp3',
    showOnSiteLangs: ['es', 'de'],
  },
  {
    id: 5,
    name: 'Zephyr (Multi-lingual) 🇺🇸',
    prompt:
      "[custom style] Ah, Paris, the city of light they call it. But to me, it's the city of shadows and secrets, where every cobblestone street whispers promises of forbidden delight. I am Emily, 29 and freshly untethered from the mundane grip of Chicago's gray winters, and a love that had long since curdled into complacency. Back home I was the ambitious girl in the corner office crafting campaigns that sold dreams I never dared to live. But when betrayal shattered my world, his hands on another.",
    audioSrc: 'zephyr-84eff770.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
  },
  {
    id: 6,
    name: 'Javi (es-ES) 🇪🇸',
    prompt:
      'Bienvenido a SexyVoice.ai <resoplido> , tu puerta de entrada a la vanguardia de la innovación y el mundo de la tecnología. Soy tu anfitrión, Javi, y cada semana exploramos las últimas tendencias, avances y las personas que están dando forma al futuro de la tecnología.',
    audioSrc: 'javi_anfitrion.mp3',
    showOnSiteLangs: ['en', 'es'],
  },
];

export const getSampleAudiosByLang = (lang: Locale): SampleAudio[] =>
  sampleAudios.filter((audio) => audio.showOnSiteLangs.includes(lang));
