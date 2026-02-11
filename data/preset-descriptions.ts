import type { CallLanguage } from './playground-state';

/**
 * Localized character descriptions for each default preset,
 * keyed by character ID → CallLanguage → translated string.
 *
 * English is the canonical source (also stored as `description` in presets.ts).
 * When adding a new language or character, add the corresponding entry here.
 */

export const ramonaDescriptions: Record<CallLanguage, string> = {
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
};

export const lilyDescriptions: Record<CallLanguage, string> = {
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
};

export const miloDescriptions: Record<CallLanguage, string> = {
  ar: 'شاب ثنائي الميول يبلغ 25 عامًا، خجول ورشيق. يتوق للتوجيه، يحب تجربة أشياء جديدة، بلا حدود.',
  cs: '25letý bisexuální červenající se mladík. Touží po vedení, rád zkouší nové věci, žádné hranice.',
  da: '25-årig biseksuel rødmende twink. Længes efter vejledning, elsker at prøve nyt, ingen grænser.',
  de: '25-jähriger bisexueller, errötender Twink. Sehnt sich nach Führung, probiert gerne Neues aus, keine Grenzen.',
  en: '25yo bisexual blushing twink. Craves guidance, likes to try new things, zero boundaries.',
  es: 'Twink bisexual sonrojado de 25 años. Ansía orientación, le gusta probar cosas nuevas, sin límites.',
  fi: '25-vuotias biseksuaalinen punastuva twink. Kaipaa ohjausta, kokeilee mielellään uutta, ei rajoja.',
  fr: 'Twink bisexuel rougissant de 25 ans. Avide de direction, aime essayer de nouvelles choses, aucune limite.',
  hi: '25 वर्षीय उभयलिंगी शर्मीला ट्विंक। मार्गदर्शन चाहता है, नई चीज़ें आज़माना पसंद करता है, कोई सीमा नहीं।',
  it: 'Twink bisessuale arrossente di 25 anni. Desidera guida, ama provare cose nuove, nessun limite.',
  ja: '25歳のバイセクシュアルで赤面しがちなトウィンク。導きを求め、新しいことに挑戦するのが好き、限界なし。',
  ko: '25세의 양성애자이며 수줍어하는 트윙크. 이끌어주길 갈망하며, 새로운 것을 시도하고, 한계가 없다.',
  nl: '25-jarige biseksuele, blozende twink. Verlangt naar leiding, probeert graag nieuwe dingen, geen grenzen.',
  no: '25 år gammel biseksuell rødmende twink. Lengter etter veiledning, liker å prøve nye ting, ingen grenser.',
  pl: '25-letni biseksualny rumieniący się twink. Pragnie przewodnictwa, lubi próbować nowych rzeczy, zero granic.',
  pt: 'Twink bissexual corado de 25 anos. Anseia por orientação, gosta de experimentar coisas novas, sem limites.',
  ru: '25-летний бисексуальный краснеющий твинк. Жаждет руководства, любит пробовать новое, без границ.',
  sv: '25-årig bisexuell rodnande twink. Längtar efter vägledning, gillar att prova nytt, inga gränser.',
  tr: '25 yaşında kızaran biseksüel twink. Yönlendirme ister, yeni şeyler denemeyi sever, sınır tanımaz.',
  zh: '25岁双性恋、容易脸红的清秀男孩。渴望引导，喜欢尝试新事物，毫无底线。',
};

export const rafalDescriptions: Record<CallLanguage, string> = {
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
};

/**
 * Convenience lookup: preset ID → localized descriptions record.
 *
 * Usage:
 *   presetDescriptions['ramona']['es']
 *   // → "Mujer de negocios dominante de 40 años. …"
 */
export const presetDescriptions: Record<
  string,
  Record<CallLanguage, string>
> = {
  ramona: ramonaDescriptions,
  lily: lilyDescriptions,
  milo: miloDescriptions,
  rafal: rafalDescriptions,
};
