import { Feed } from 'feed';

import { appName, docsUrl, siteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export function getRSS() {
  const feed = new Feed({
    title: appName,
    id: docsUrl,
    link: docsUrl,
    language: 'en',

    image: `${siteUrl}/web-app-manifest-512x512.png`,
    favicon: `${siteUrl}/favicon.ico`,
    copyright: 'All rights reserved 2026, SexyVoice.ai',
  });

  for (const page of source.getPages()) {
    feed.addItem({
      id: page.url,
      title: page.data.title,
      description: page.data.description,
      link: `${docsUrl}${page.url}`,
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
