import type { Route } from '@playwright/test';

export const mockAudioFiles = [
  {
    id: 'file-001',
    user_id: 'test-user-id',
    storage_key: 'audio/test-hello-world.mp3',
    url: 'https://files.sexyvoice.ai/test-hello-world.mp3',
    text_content: 'Hello, this is a test message for voice generation.',
    status: 'active',
    created_at: '2025-01-15T10:30:00.000Z',
    updated_at: '2025-01-15T10:30:00.000Z',
    voice_id: 'voice-001',
    voices: { name: 'Zephyr' },
    usage: null,
  },
  {
    id: 'file-002',
    user_id: 'test-user-id',
    storage_key: 'audio/test-another-message.mp3',
    url: 'https://files.sexyvoice.ai/test-another-message.mp3',
    text_content: 'Another test message for voice generation.',
    status: 'active',
    created_at: '2025-01-14T09:00:00.000Z',
    updated_at: '2025-01-14T09:00:00.000Z',
    voice_id: 'voice-002',
    voices: { name: 'Poe' },
    usage: null,
  },
];

export async function handleAudioFiles(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockAudioFiles),
  });
}
