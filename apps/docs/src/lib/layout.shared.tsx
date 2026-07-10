import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { AudioLinesIcon } from "lucide-react";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/main/apps/docs`,
    links: [
      {
        icon: <AudioLinesIcon />,
        text: "SexyVoice.ai",
        url: "https://sexyvoice.ai",
        // secondary items will be displayed differently on navbar
        secondary: false,
      },
    ],
  };
}
