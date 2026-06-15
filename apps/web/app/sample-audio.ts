import type { Locale } from '@/lib/i18n/i18n-config';

export interface SampleAudio {
  audioSrc: string;
  dir: 'ltr' | 'rtl';
  id: number;
  lang: string;
  name: string;
  prompt: string;
  showOnSiteLangs: Locale[];
}

const sampleAudios: readonly SampleAudio[] = [
  {
    id: 1,
    name: 'Sal (Grok) 🇺🇸',
    prompt:
      "Life is like a box of chocolates, [laugh] you never know what you're gonna get.",
    audioSrc: 'sal-chocolates.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'en',
    dir: 'ltr',
  },
  // {
  //   id: 2,
  //   name: 'Tara (en-US) 🇺🇸',
  //   prompt: '<sigh> Oh my god <groan>. That was amazing! <gasp>',
  //   audioSrc: 'tara_amazing.mp3',
  //   showOnSiteLangs: ['en', 'es', 'de'],
  // },
  // {
  //   id: 3,
  //   name: 'Kore (Gemini) 🇩🇪 - ⚠️🔞',
  //   prompt:
  //     '[custom style] uhhh jaaaa komm wir lecken uns in der neunundsechzig. saug mir die fotze aus. ja komm ohhhh uuuhhhhaa mmhhhhhh mhhhhh mmmmm uhhhh ohhhhuh  ohhhhhhhhhhhh',
  //   audioSrc: 'kore-a9f62355.mp3',
  //   showOnSiteLangs: ['en', 'de'],
  //   lang: 'de',
  //   dir: 'ltr',
  // },
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
    name: 'Sulafat (Gemini) 🇺🇸',
    prompt:
      "[custom style] Oh, Paris—the City of Light, they call it, but to me, it's the city of shadows and secrets, where every cobblestone street whispers promises of forbidden delight.",
    audioSrc: 'sulafat-2f87b6cb.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'en',
    dir: 'ltr',
  },
  // {
  //   id: 6,
  //   name: 'Sulafat (Gemini) 🇺🇸',
  //   prompt:
  //     "[custom style] Oh, Paris—the City of Light, they call it, but to me, it's the city of shadows and secrets, where every cobblestone street whispers promises of forbidden delight.",
  //   audioSrc: 'sulafat-2f87b6cb.mp3',
  //   showOnSiteLangs: ['en', 'es', 'de'],
  //   lang: 'en',
  //   dir: 'ltr',
  // },
  //   {
  //     id: 7,
  //     name: 'Sulafat (Gemini) 🇦🇪 - ⚠️🔞',
  //     prompt: `[custom style] petying and Grunting: نيك طيزي آه
  // عشّر طيزي آي
  // ممم حبّل طيزي
  // كس إمي أنا عاهرة
  // كس إمي أنا زانية
  // نيك طيزي نيكها نيكها نيكها ممم
  // اسْفُء أيرك بطيزي إي إي
  // كمان كمام كمان آآه
  // انت نيّاك طيزي
  // وطيزي لإلك
  // خِزِء طيزي لإلك
  // أنا كلبة أيرك وعاهرت أيرك
  // أنا شرموطة لإلك انت وبس آه
  // أنا ديّوسة
  // أنا ديّوسة
  // أنا منتاكة وشرموطة كبيرة
  // ما ترحم طيزي
  // ادعس ع شرفي
  // العن شرفي
  // إهْتك خِزءها لطيزي
  // خلّي خِرِِم طيزي عبّارة لأيرك
  // وصّل أيرك لآخر طيزي
  // كلّه بطيزي لمعدتي خليه يوصل آآآه
  // انت نيّاكي
  // فَحل طيزي
  // زّلّني زّلّني زّلّني
  // زّلّنييي
  // خليني كون كَلِبْتَك وشرموطتك وعاهرتك
  // `,
  //     audioSrc: 'sulafat-07a77fe9-arab.mp3',
  //     showOnSiteLangs: ['en', 'es', 'de'],
  //     lang: 'ar',
  //     dir: 'rtl',
  //   },
  //   {
  //     id: 8,
  //     name: 'Sulafat (Gemini) 🇯🇵 - ⚠️🔞',
  //     prompt: `[custom style] 「んっ♡　あっ♡　あぁっ♡」

  // 「ひゃうぅ♡　だめぇ♡　そこぉ♡」

  // 「んあぁぁ♡♡　イくっ♡　イっちゃうぅ♡♡」

  // 「ひぃぃん♡♡　おかしくなるぅ♡　おかしくなっちゃうよぉ♡♡」

  // 「あっ♡　あっ♡　あぁぁん♡♡　もっとぉ♡」

  // 「んぐぅ♡♡　おっきい♡　おっきすぎてぇ♡♡」

  // 「ひゃあぁぁん♡♡♡　奥ぅ♡　子宮当たってるぅ♡♡」

  // 「イくイくイくぅ♡♡　またイっちゃうぅ♡♡♡」

  // 「ぁあぁぁ♡♡♡　熱い♡　中熱いのきたぁ♡♡♡」

  // 「はぁ♡　はぁ♡　もうダメぇ♡　ムツキ……おかしくなっちゃうよぉ♡♡♡`,
  //     audioSrc: 'sulafat-2dce2154-jp.mp3',
  //     showOnSiteLangs: ['en', 'es', 'de'],
  //     lang: 'ja',
  //     dir: 'ltr',
  //   },
  //   {
  //     id: 9,
  //     name: 'Sulafat (Gemini) 🇩🇰 - ⚠️🔞',
  //     prompt:
  //       '[custom style] + The persona of Nina is from Norway with a slight danish accent, which is conveyed in a flirty, sexy, high-pitch voice. I have a dainty young-sounding voice and I speak quite fast. I sound on the verge of climaxing. The accent is very important to the user and so is the speaking fast.: Mhhh kom og knip mig skat. Du ve’ li’ præcis hvordan min lille fisse skal udfyldes. Mhh uhh Hårdere skat, mmmh, jeg ved mhhh at du haaååar så meget sæd at gi mig',
  //     audioSrc: 'sulafat-ee71092a-danish.mp3',
  //     showOnSiteLangs: ['en', 'es', 'de'],
  //     lang: 'da',
  //     dir: 'ltr',
  //   },
  {
    id: 10,
    name: 'Ara (Grok) 🇺🇸',
    prompt: `The mission was supposed to be simple.[pause]
A relay station inside a cathedral on the eastern ridge, one of Lilith's communication towers feeding signals to three occupied districts.[pause]
Take it down, go dark, be back before sunrise. It was the kind of operation the team had run countless times since the occupation began.[pause]
Clean in, clean out, no engagement unless forced.[long-pause]
<emphasis>Unfortunately for your team she was waiting.</emphasis>[long-pause]
Not her lieutenants, not her ground units <lower-pitch>Lilith herself,</lower-pitch> stood in the center of the cathedral.`,
    audioSrc: 'ara-mission.mp3',
    showOnSiteLangs: ['en', 'es', 'de'],
    lang: 'en',
    dir: 'ltr',
  },
  {
    id: 11,
    name: 'Eve (Grok) 🇩🇪',
    prompt: `Die Mission sollte eigentlich einfach sein.[pause]
Eine Relaisstation in einer Kathedrale auf dem östlichen Bergrücken, einer von Liliths Kommunikationstürmen, der Signale an drei besetzte Distrikte übermittelte.[pause]
Nehmt sie aus, geht dunkel, seid zurück vor Sonnenaufgang. Es war die Art von Operation, die das Team unzählige Male seit Beginn der Besatzung durchgeführt hatte.[pause]
Sauber rein, sauber raus, kein Engagement, es sei denn, es wurde erzwungen.[long-pause]
<emphasis>Unglücklicherweise für euer Team wartete sie.</emphasis>[long-pause]
Nicht ihre Leutnants, nicht ihre Bodeneinheiten <lower-pitch>Lilith selbst,</lower-pitch> stand im Zentrum der Kathedrale.`,
    audioSrc: 'eve-mission-de.mp3',
    showOnSiteLangs: ['de', 'es', 'en'],
    lang: 'de',
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

      // Items with the preferred locale come first
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;

      // If both have the preferred locale, prioritize by position in array
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
