import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { server as mockServer } from '../setup';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/supabase/auth', () => ({
  getVerifiedClaims: vi.fn().mockResolvedValue({ sub: 'test-user' }),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/voice-spike/route';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

function claims(
  sub: string,
): NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>> {
  return {
    sub,
    iss: 'https://example.com/auth/v1',
    aud: 'authenticated',
    exp: 9_999_999_999,
    iat: 1,
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'test-session',
  };
}
const contextKey = Symbol.for('@vercel/request-context');
const originalContext = Reflect.get(globalThis, contextKey);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.mocked(getVerifiedClaims).mockResolvedValue(claims('test-user'));
  Reflect.set(globalThis, contextKey, originalContext);
});

function request(headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/voice-spike', {
    headers: {
      origin: 'https://example.com',
      upgrade: 'websocket',
      ...headers,
    },
  });
}

function enable() {
  vi.stubEnv('VOICE_SPIKE_USER_IDS', 'test-user');
  vi.stubEnv('VERCEL_ENV', 'preview');
}

describe('Next.js voice probe route', () => {
  it('is disabled by default without accessing auth or providers', async () => {
    vi.stubEnv('VOICE_SPIKE_USER_IDS', '');
    expect((await GET(request())).status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('rejects wrong Origin and non-upgrade requests before accessing auth', async () => {
    enable();
    expect(
      (await GET(request({ origin: 'https://attacker.invalid' }))).status,
    ).toBe(403);
    expect((await GET(request({ upgrade: '' }))).status).toBe(426);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('rejects missing identity, another user and production', async () => {
    enable();
    vi.mocked(getVerifiedClaims).mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    vi.mocked(getVerifiedClaims).mockResolvedValueOnce(claims('other-user'));
    expect((await GET(request())).status).toBe(404);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await GET(request())).status).toBe(404);
  });
  it('rejects invalid lease values before upgrade', async () => {
    enable();
    expect(
      (
        await GET(
          new Request('https://example.com/api/voice-spike?leaseSeconds=1800', {
            headers: { origin: 'https://example.com', upgrade: 'websocket' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('runs a real loopback socket through the installed Vercel upgrade helper and Next.js handler', async () => {
    enable();
    // Exercise native Node upgrades; MSW's HTTP interceptor does not proxy them.
    mockServer.close();
    const server = createServer();
    const handlerDone: Response[] = [];
    server.on('upgrade', (req, socket, head) => {
      Reflect.set(globalThis, contextKey, {
        get: () => ({ upgradeWebSocket: () => ({ req, socket, head }) }),
      });
      const url = `http://${req.headers.host}${req.url}`;
      GET(
        new Request(url, {
          headers: {
            origin: `http://${req.headers.host}`,
            upgrade: 'websocket',
          },
        }),
      )
        .then((response) => {
          handlerDone.push(response);
        })
        .catch(() => socket.destroy());
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test port');
    const client = new WebSocket(
      `ws://127.0.0.1:${address.port}/api/voice-spike?leaseSeconds=10`,
    );
    try {
      const [ready] = await once(client, 'message');
      expect(JSON.parse(ready.toString())).toMatchObject({
        type: 'ready',
        leaseMs: 10_000,
        durability: 'connection-only',
      });
      client.send(JSON.stringify({ type: 'ping', id: 'probe' }));
      const [pong] = await once(client, 'message');
      expect(JSON.parse(pong.toString())).toEqual({
        type: 'pong',
        id: 'probe',
      });
      const closed = once(client, 'close');
      client.close();
      await closed;
      await vi.waitFor(() => expect(handlerDone[0]?.status).toBe(204));
    } finally {
      client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      mockServer.listen({ onUnhandledRequest: 'error' });
    }
  });
});
