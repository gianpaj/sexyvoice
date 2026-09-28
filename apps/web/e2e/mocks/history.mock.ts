import type { Route } from '@playwright/test';

import { E2E_USER_ID } from '@/lib/e2e-mocks-shared';

export const mockAudioFiles = [
  {
    created_at: '2025-01-15T10:30:00.000Z',
    id: 'file-001',
    status: 'active',
    storage_key: 'audio/test-hello-world.mp3',
    text_content: 'Hello, this is a test message for voice generation.',
    updated_at: '2025-01-15T10:30:00.000Z',
    url: 'https://files.sexyvoice.ai/test-hello-world.mp3',
    usage: null,
    user_id: E2E_USER_ID,
    voice_id: 'voice-001',
    voices: { name: 'Zephyr' },
  },
  {
    created_at: '2025-01-14T09:00:00.000Z',
    id: 'file-002',
    status: 'active',
    storage_key: 'audio/test-another-message.mp3',
    text_content: 'Another test message for voice generation.',
    updated_at: '2025-01-14T09:00:00.000Z',
    url: 'https://files.sexyvoice.ai/test-another-message.mp3',
    usage: null,
    user_id: E2E_USER_ID,
    voice_id: 'voice-002',
    voices: { name: 'Poe' },
  },
];

export async function handleAudioFiles(route: Route) {
  await route.fulfill({
    body: JSON.stringify(mockAudioFiles),
    contentType: 'application/json',
    status: 200,
  });
}
