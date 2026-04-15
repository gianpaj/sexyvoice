import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

import { appName, gitConfig } from './shared';
import { AudioLinesIcon } from 'lucide-react';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        icon: <AudioLinesIcon />,
        text: 'SexyVoice.ai',
        url: 'https://sexyvoice.ai',
        // secondary items will be displayed differently on navbar
        secondary: false,
      },
    ],
  };
}
