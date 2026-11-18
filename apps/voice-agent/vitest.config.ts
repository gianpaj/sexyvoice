import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [
          '@livekit/agents-plugin-inworld',
          '@livekit/agents-plugin-xai',
        ],
      },
    },
  },
});
