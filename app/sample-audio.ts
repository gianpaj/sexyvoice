import type { Locale } from '@/lib/i18n/i18n-config';

export interface SampleAudio {
  id: number;
  name: string;
  prompt: string;
  audioSrc: string;
  showOnSiteLangs: Locale[];
  lang: string;
  dir: 'ltr' | 'rtl';
}

const sampleAudios: readonly SampleAudio[] = [
  // {
  //   id: 1,
  //   name: 'Tara',
  //   prompt:
  //     "Life is like a box of chocolates, you never know what you're gonna get.",
  //   audioSrc: '/audios/tara_20250320_130636.mp3',
  // },
  // {
  //   id: 2,
  //   name: 'Tara (en-US) 🇺🇸',
  //   prompt: '<sigh> Oh my god <groan>. That was amazing! <gasp>',
  //   audioSrc: 'tara_amazing.mp3',
  //   showOnSiteLangs: ['en', 'es', 'de'],
  // },
  {
    id: 3,
    name: 'Kore (Multilingual) 🇩🇪',
    prompt:
      '[custom style] uhhh jaaaa komm wir lecken uns in der neunundsechzig. saug mir die fotze aus. ja komm ohhhh uuuhhhhaa mmhhhhhh mhhhhh mmmmm uhhhh ohhhhuh  ohhhhhhhhhhhh',
    audioSrc: 'kore-a9f62355.mp3',
    showOnSiteLangs: ['en', 'de'],
    lang: 'de',
    dir: 'ltr',
  },
  //   {
  //     id: 4,
  //     name: 'Dan (en-UK) 🇬🇧',
  //     prompt: `Alright, so, uhm, <chuckle> why do dogs run in circles before they lie down? <pause>
  // Because it's hard to lay down in a square! <laugh>
  // I mean, imagine a dog just trying to plop down in perfect 90-degree angles. <snicker> Pure chaos!`,
  //     audioSrc: 'dan_joke.mp3',
  //     showOnSiteLangs: ['es'],
  //   },
  {
    id: 5,
    name: 'Zephyr (Multilingual) 🇺🇸',
    prompt:
      "[custom style] Ah, Paris, the city of light they call it. But to me, it's the city of shadows and secrets, where every cobblestone street whispers promises of forbidden delight. I am Emily, 29 and freshly untethered from the mundane grip of Chicago's gray winters, and a love that had long since curdled into complacency. Back home I was the ambitious girl in the corner office crafting campaigns that sold dreams I never dared to live. But when betrayal shattered my world, his hands on another.",
    audioSrc: 'zephyr-84eff770.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'en',
    dir: 'ltr',
  },
  {
    id: 6,
    name: 'Sulafat (Multilingual) 🇺🇸',
    prompt:
      "[custom style] Oh, Paris—the City of Light, they call it, but to me, it's the city of shadows and secrets, where every cobblestone street whispers promises of forbidden delight.",
    audioSrc: 'sulafat.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'en',
    dir: 'ltr',
  },
  {
    id: 7,
    name: 'Sulafat (Multilingual) 🇦🇪 - ⚠️🔞',
    prompt: `[custom style] petying and Grunting: نيك طيزي آه
    عشّر طيزي آي
    ممم حبّل طيزي
    كس إمي أنا عاهرة
    كس إمي أنا زانية
    نيك طيزي نيكها نيكها نيكها ممم
    اسْفُء أيرك بطيزي إي إي
    كمان كمام كمان آآه
    انت نيّاك طيزي
    وطيزي لإلك
    خِزِء طيزي لإلك
    أنا كلبة أيرك وعاهرت أيرك
    أنا شرموطة لإلك انت وبس آه
    أنا ديّوسة
    أنا ديّوسة
    أنا منتاكة وشرموطة كبيرة
    ما ترحم طيزي
    ادعس ع شرفي
    العن شرفي
    إهْتك خِزءها لطيزي
    خلّي خِرِِم طيزي عبّارة لأيرك
    وصّل أيرك لآخر طيزي
    كلّه بطيزي لمعدتي خليه يوصل آآآه
    انت نيّاكي
    فَحل طيزي
    زّلّني زّلّني زّلّني
    زّلّنييي
    خليني كون كَلِبْتَك وشرموطتك وعاهرتك
`,
    audioSrc: 'sulafat-07a77fe9-arab.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'ar',
    dir: 'rtl',
  },
  {
    id: 8,
    name: 'Sulafat (Multilingual) 🇯🇵 - ⚠️🔞',
    prompt: `[custom style] 「んっ♡　あっ♡　あぁっ♡」

      「ひゃうぅ♡　だめぇ♡　そこぉ♡」

      「んあぁぁ♡♡　イくっ♡　イっちゃうぅ♡♡」

      「ひぃぃん♡♡　おかしくなるぅ♡　おかしくなっちゃうよぉ♡♡」

      「あっ♡　あっ♡　あぁぁん♡♡　もっとぉ♡」

      「んぐぅ♡♡　おっきい♡　おっきすぎてぇ♡♡」

      「ひゃあぁぁん♡♡♡　奥ぅ♡　子宮当たってるぅ♡♡」

      「イくイくイくぅ♡♡　またイっちゃうぅ♡♡♡」

      「ぁあぁぁ♡♡♡　熱い♡　中熱いのきたぁ♡♡♡」

      「はぁ♡　はぁ♡　もうダメぇ♡　ムツキ……おかしくなっちゃうよぉ♡♡♡`,
    audioSrc: 'sulafat-2dce2154-jp.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'ja',
    dir: 'ltr',
  },
  {
    id: 9,
    name: 'Sulafat (Multilingual) 🇩🇰 - ⚠️🔞',
    prompt:
      '[custom style] + The persona of Nina is from Norway with a slight danish accent, which is conveyed in a flirty, sexy, high-pitch voice. I have a dainty young-sounding voice and I speak quite fast. I sound on the verge of climaxing. The accent is very important to the user and so is the speaking fast.: Mhhh kom og knip mig skat. Du ve’ li’ præcis hvordan min lille fisse skal udfyldes. Mhh uhh Hårdere skat, mmmh, jeg ved mhhh at du haaååar så meget sæd at gi mig',
    audioSrc: 'sulafat-ee71092a-danish.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'da',
    dir: 'ltr',
  },
];

/**
 * Get sample audios filtered by language and sorted by preferred language
 * Limits results to 6 samples
 * @param locale - Optional locale to sort by (e.g., 'en', 'es', 'de')
 */
export function getSampleAudiosByLanguage(locale?: string): SampleAudio[] {
  // Create a copy to avoid mutating the original array
  const sortedAudios = [...sampleAudios];

  // Sort by locale relevance if available
  if (locale) {
    sortedAudios.sort((a, b) => {
      const aIndex = a.lang.indexOf(locale);
      const bIndex = b.lang.indexOf(locale);

      // Items with the geo locale come first
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;

      // If both have the geo locale, prioritize by position in array
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // Otherwise maintain original order
      return 0;
    });
  }

  // Limit to 6 samples
  return sortedAudios.slice(0, 6);
}

/**
 * Get the browser's preferred locale on the client side
 */
export function getClientLocale(): string | null {
  if (typeof window === 'undefined') return null;

  const browserLang =
    navigator.language || (navigator as { userLanguage?: string }).userLanguage;
  if (browserLang) {
    return browserLang.split('-')[0];
  }

  return null;
}
