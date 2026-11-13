import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { AudioLinesIcon } from 'lucide-react';
import { appName, gitConfig, siteUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/${gitConfig.branch}/apps/docs`,
    links: [
      {
        icon: <AudioLinesIcon />,
        text: 'SexyVoice.ai',
        url: siteUrl,
        // secondary items will be displayed differently on navbar
        secondary: false,
      },
    ],
  };
}
