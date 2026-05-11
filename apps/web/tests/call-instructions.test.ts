import { captureException, captureMessage } from '@sentry/nextjs';
import { get } from '@vercel/edge-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCallInstructionConfig } from '@/lib/edge-config/call-instructions';

vi.mock('@vercel/edge-config', () => ({
  get: vi.fn(),
}));

describe('getCallInstructionConfig()', () => {
  const originalEdgeConfig = process.env.EDGE_CONFIG;
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEdgeConfig === undefined) {
      delete process.env.EDGE_CONFIG;
    } else {
      process.env.EDGE_CONFIG = originalEdgeConfig;
    }

    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  it('uses fallback config quietly when Edge Config is not configured outside production', async () => {
    delete process.env.EDGE_CONFIG;
    process.env.VERCEL_ENV = 'preview';

    const config = await getCallInstructionConfig();

    expect(config.defaultInstructions).toBeTruthy();
    expect(config.initialInstruction).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports missing Edge Config only in Vercel production', async () => {
    delete process.env.EDGE_CONFIG;
    process.env.VERCEL_ENV = 'production';

    await getCallInstructionConfig();

    expect(get).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'Edge Config connection string missing.',
      expect.objectContaining({
        level: 'warning',
        tags: {
          area: 'edge-config',
          config: 'call-instructions',
        },
      }),
    );
  });

  it('suppresses Edge Config fetch failures outside Vercel production', async () => {
    process.env.EDGE_CONFIG = 'edge-config-connection';
    process.env.VERCEL_ENV = 'preview';
    vi.mocked(get).mockRejectedValueOnce(new Error('Edge Config unavailable'));

    const config = await getCallInstructionConfig();

    expect(config.defaultInstructions).toBeTruthy();
    expect(config.initialInstruction).toBeTruthy();
    expect(get).toHaveBeenCalledWith('call-instructions');
    expect(captureException).not.toHaveBeenCalled();
  });
});
