import { Feed } from 'feed';
import { source } from '@/lib/source';

const baseUrl = 'https://docs.sexyvoice.ai';

export function getRSS() {
  const feed = new Feed({
    title: 'SexyVoice Docs',
    id: `${baseUrl}`,
    link: `${baseUrl}`,
    language: 'en',

    image: `${baseUrl}/banner.png`,
    favicon: `${baseUrl}/icon.png`,
    copyright: 'All rights reserved 2026, SexyVoice.ai',
  });

  for (const page of source.getPages()) {
    feed.addItem({
      id: page.url,
      title: page.data.title,
      description: page.data.description,
      link: `${baseUrl}${page.url}`,
      // FIXME:
      date: new Date(),
      // date: new Date(page.data.lastModified),

      author: [
        {
          name: 'Gianfranco Palumbo',
        },
      ],
    });
  }

  return feed.rss2();
}
