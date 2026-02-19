import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock variables – declared before vi.mock() so factories can reference them
// ---------------------------------------------------------------------------
const mockUser = {
  id: 'a1b2c3d4-5678-4abc-9def-012345678901',
  email: 'test@example.com',
};
let mockIsAuthenticated = true;
let mockHasUserPaid = true;
let mockCustomCharacterCount = 0;
let mockVoiceExists = true;

// Track DB operations for assertions
const insertedPrompts: Array<Record<string, unknown>> = [];
const insertedCharacters: Array<Record<string, unknown>> = [];
const updatedPrompts: Array<Record<string, unknown>> = [];
const updatedCharacters: Array<Record<string, unknown>> = [];
const deletedCharacterIds: string[] = [];
const deletedPromptIds: string[] = [];

// Fake character/prompt data returned by queries
const fakePublicCharacter = {
  id: 'b0000000-0000-4000-a000-000000000001',
  prompt_id: 'a0000000-0000-4000-a000-000000000001',
  user_id: 'ad000000-0000-4000-a000-000000000000',
  is_public: true,
  name: 'Ramona',
  voice_id: 'f832da16-5fe7-4823-9c99-b0f738e39b68',
};

const fakeUserCharacter = {
  id: 'dd000000-0000-4000-a000-000000000099',
  prompt_id: 'ee000000-0000-4000-a000-000000000099',
  user_id: mockUser.id,
  is_public: false,
  name: 'My Custom Char',
  voice_id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
  localized_descriptions: {},
  session_config: {
    model: 'grok-4-1-fast-non-reasoning',
    voice: 'Ara',
    temperature: 0.8,
    maxOutputTokens: null,
    grokImageEnabled: false,
  },
  sort_order: 0,
  image: null,
  voices: { name: 'Ara', sample_url: 'https://files.sexyvoice.ai/ara.mp3' },
  prompts: { prompt: 'Be nice', localized_prompts: {} },
};

const fakeOtherUserCharacter = {
  ...fakeUserCharacter,
  id: 'ff000000-0000-4000-a000-000000000077',
  prompt_id: 'ff000000-0000-4000-a000-000000000078',
  user_id: 'ce000000-0000-4000-a000-000000000000',
};

// ---------------------------------------------------------------------------
// Supabase client mock – simulates queries via a chainable builder
// ---------------------------------------------------------------------------

function createQueryBuilder(tableName: string) {
  const _table = tableName;
  let _operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  // Track the "real" mutation so .select() after .insert()/.update() doesn't lose it
  let _mutationOp: 'insert' | 'update' | null = null;
  const _filters: Array<{ column: string; value: unknown }> = [];
  let _selectFields = '*';
  let _insertData: Record<string, unknown> | null = null;
  let _updateData: Record<string, unknown> | null = null;
  let _isSingle = false;
  let _countMode = false;
  let _headMode = false;

  const builder: Record<string, any> = {};

  builder.select = (
    fields?: string,
    opts?: { count?: string; head?: boolean },
  ) => {
    // If select is called after insert/update, keep the mutation operation
    // (this is the Supabase "returning" pattern: .insert().select().single())
    if (!_mutationOp) {
      _operation = 'select';
    }
    _selectFields = fields || '*';
    if (opts?.count) _countMode = true;
    if (opts?.head) _headMode = true;
    return builder;
  };

  builder.insert = (data: Record<string, unknown>) => {
    _operation = 'insert';
    _mutationOp = 'insert';
    _insertData = data;
    return builder;
  };

  builder.update = (data: Record<string, unknown>) => {
    _operation = 'update';
    _mutationOp = 'update';
    _updateData = data;
    return builder;
  };

  builder.delete = () => {
    _operation = 'delete';
    return builder;
  };

  builder.eq = (column: string, value: unknown) => {
    _filters.push({ column, value });
    return builder;
  };

  builder.single = () => {
    _isSingle = true;
    return resolveQuery();
  };

  // Resolve the builder into a result
  function resolveQuery(): { data: unknown; error: unknown; count?: number } {
    // ── prompts table ──
    if (_table === 'prompts') {
      if (_operation === 'insert') {
        insertedPrompts.push(_insertData!);
        return {
          data: { id: 'new-prompt-id-0000-0000-000000000000' },
          error: null,
        };
      }
      if (_operation === 'update') {
        const promptId = _filters.find((f) => f.column === 'id')?.value;
        updatedPrompts.push({ ..._updateData!, id: promptId });
        return { data: { id: promptId }, error: null };
      }
      if (_operation === 'delete') {
        const promptId = _filters.find((f) => f.column === 'id')?.value;
        if (promptId) deletedPromptIds.push(String(promptId));
        return { data: null, error: null };
      }
    }

    // ── characters table ──
    if (_table === 'characters') {
      if (_operation === 'insert') {
        insertedCharacters.push(_insertData!);
        const returnData = {
          ..._insertData,
          id: 'new-char-id-0000-0000-000000000000',
          voices: { name: 'Ara', sample_url: null },
          prompts: { prompt: _insertData!.prompt || '', localized_prompts: {} },
        };
        return { data: returnData, error: null };
      }

      if (_operation === 'update') {
        const charId = _filters.find((f) => f.column === 'id')?.value;
        updatedCharacters.push({ ..._updateData!, id: charId });
        const returnData = {
          ...fakeUserCharacter,
          ..._updateData,
          id: charId,
        };
        return { data: returnData, error: null };
      }

      if (_operation === 'delete') {
        const charId = _filters.find((f) => f.column === 'id')?.value;
        if (charId) deletedCharacterIds.push(String(charId));
        return { data: null, error: null };
      }

      if (_operation === 'select') {
        // Count query
        if (_countMode) {
          return { data: null, error: null, count: mockCustomCharacterCount };
        }

        // Single character lookup
        if (_isSingle) {
          const idFilter = _filters.find((f) => f.column === 'id')?.value;

          if (idFilter === fakePublicCharacter.id) {
            return { data: fakePublicCharacter, error: null };
          }
          if (idFilter === fakeUserCharacter.id) {
            return { data: fakeUserCharacter, error: null };
          }
          if (idFilter === fakeOtherUserCharacter.id) {
            return { data: fakeOtherUserCharacter, error: null };
          }

          return {
            data: null,
            error: { code: 'PGRST116', message: 'not found' },
          };
        }
      }
    }

    return { data: null, error: null };
  }

  // Terminal methods that aren't .single()
  const originalResolve = () => resolveQuery();

  // Make the builder thenable so `await supabase.from(...).select(...)` works
  builder.then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => {
    try {
      resolve(resolveQuery());
    } catch (e) {
      reject(e);
    }
  };

  return builder;
}

// ---------------------------------------------------------------------------
// vi.mock() calls – must be at module top level
// ---------------------------------------------------------------------------

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => {
        if (!mockIsAuthenticated) {
          return { data: { user: null } };
        }
        return { data: { user: mockUser } };
      }),
    },
    from: (table: string) => createQueryBuilder(table),
  })),
}));

vi.mock('@/lib/supabase/queries', () => ({
  hasUserPaid: vi.fn(async () => mockHasUserPaid),
  getVoiceIdByName: vi.fn(async (name: string, _isPublic: boolean) => {
    if (!mockVoiceExists) throw new Error('Voice not found');
    return {
      id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
      name,
      language: 'multiple',
      model: 'xai',
    };
  }),
  countUserCallCharacters: vi.fn(async () => mockCustomCharacterCount),
  // Re-export other functions that might be imported
  getCredits: vi.fn(),
  isFreeUserOverCallLimit: vi.fn(),
  resolveCharacterPrompt: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the route handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { DELETE, POST } from '@/app/api/characters/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>, method = 'POST'): Request {
  return new Request('http://localhost/api/characters', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Character',
    prompt: 'You are a helpful test character.',
    voiceName: 'Ara',
    sessionConfig: {
      model: 'grok-4-1-fast-non-reasoning',
      voice: 'Ara',
      temperature: 0.8,
      maxOutputTokens: null,
      grokImageEnabled: false,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('/api/characters', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
    mockHasUserPaid = true;
    mockCustomCharacterCount = 0;
    mockVoiceExists = true;
    insertedPrompts.length = 0;
    insertedCharacters.length = 0;
    updatedPrompts.length = 0;
    updatedCharacters.length = 0;
    deletedCharacterIds.length = 0;
    deletedPromptIds.length = 0;
  });

  // ─── Authentication ────────────────────────────────────────────────
  describe('authentication', () => {
    it('returns 401 for unauthenticated user (POST)', async () => {
      mockIsAuthenticated = false;
      const res = await POST(makeRequest(validCreateBody()));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('returns 401 for unauthenticated user (DELETE)', async () => {
      mockIsAuthenticated = false;
      const res = await DELETE(
        makeRequest({ id: fakeUserCharacter.id }, 'DELETE'),
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });
  });

  // ─── POST: paid gate ───────────────────────────────────────────────
  describe('POST: paid user gate', () => {
    it('returns 403 for unpaid users', async () => {
      mockHasUserPaid = false;
      const res = await POST(makeRequest(validCreateBody()));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('paid');
    });
  });

  // ─── POST: validation ─────────────────────────────────────────────
  describe('POST: input validation', () => {
    it('returns 400 when name is missing', async () => {
      const res = await POST(makeRequest(validCreateBody({ name: '' })));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Name');
    });

    it('returns 400 when name exceeds 50 characters', async () => {
      const longName = 'A'.repeat(51);
      const res = await POST(makeRequest(validCreateBody({ name: longName })));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('50');
    });

    it('returns 400 when prompt exceeds 5000 characters', async () => {
      const longPrompt = 'X'.repeat(5001);
      const res = await POST(
        makeRequest(validCreateBody({ prompt: longPrompt })),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('5000');
    });

    it('returns 400 when voiceName is missing', async () => {
      const res = await POST(makeRequest(validCreateBody({ voiceName: '' })));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Voice');
    });

    it('returns 400 when sessionConfig is missing', async () => {
      const res = await POST(
        makeRequest(validCreateBody({ sessionConfig: undefined })),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Session config');
      // Zod returns "Session config is required" via formatZodError
    });

    it('returns 400 with invalid JSON body', async () => {
      const request = new Request('http://localhost/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const res = await POST(request);
      expect(res.status).toBe(400);
    });
  });

  // ─── POST: voice validation ───────────────────────────────────────
  describe('POST: voice validation', () => {
    it('returns 400 when voice does not exist in DB', async () => {
      mockVoiceExists = false;
      const res = await POST(
        makeRequest(validCreateBody({ voiceName: 'NonExistentVoice' })),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Voice');
    });
  });

  // ─── POST: create (happy path) ────────────────────────────────────
  describe('POST: create character', () => {
    it('creates a character + prompt and returns 201', async () => {
      const body = validCreateBody();
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(201);

      // Verify prompt was inserted
      expect(insertedPrompts).toHaveLength(1);
      expect(insertedPrompts[0]).toMatchObject({
        user_id: mockUser.id,
        type: 'call',
        is_public: false,
        prompt: body.prompt,
      });

      // Verify character was inserted
      expect(insertedCharacters).toHaveLength(1);
      expect(insertedCharacters[0]).toMatchObject({
        user_id: mockUser.id,
        is_public: false,
        name: body.name,
      });
    });

    it('returns 400 when 10 characters already exist', async () => {
      mockCustomCharacterCount = 10;
      const res = await POST(makeRequest(validCreateBody()));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('10');
    });

    it('trims whitespace from character name', async () => {
      const body = validCreateBody({ name: '  Padded Name  ' });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(201);
      expect(insertedCharacters[0].name).toBe('Padded Name');
    });
  });

  // ─── POST: update (happy path) ────────────────────────────────────
  describe('POST: update character', () => {
    it('updates an existing character + prompt', async () => {
      const body = validCreateBody({
        id: fakeUserCharacter.id,
        name: 'Updated Name',
        prompt: 'Updated prompt text',
      });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);

      expect(updatedPrompts).toHaveLength(1);
      expect(updatedPrompts[0]).toMatchObject({
        prompt: 'Updated prompt text',
        id: fakeUserCharacter.prompt_id,
      });

      expect(updatedCharacters).toHaveLength(1);
      expect(updatedCharacters[0]).toMatchObject({
        name: 'Updated Name',
        id: fakeUserCharacter.id,
      });
    });

    it('returns 404 when updating non-owned character', async () => {
      const body = validCreateBody({
        id: fakeOtherUserCharacter.id,
        name: 'Hacked Name',
      });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(404);
    });

    it('returns 403 when trying to update a public/predefined character', async () => {
      const body = validCreateBody({
        id: fakePublicCharacter.id,
        name: 'Hacked Public',
      });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('predefined');
    });

    it('returns 404 when updating a character that does not exist', async () => {
      const body = validCreateBody({
        id: '00000000-dead-4000-a000-000000000000',
        name: 'Ghost Character',
      });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE ────────────────────────────────────────────────────────
  describe('DELETE: delete character', () => {
    it('deletes character and its prompt (happy path)', async () => {
      const res = await DELETE(
        makeRequest({ id: fakeUserCharacter.id }, 'DELETE'),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(deletedCharacterIds).toContain(fakeUserCharacter.id);
      expect(deletedPromptIds).toContain(fakeUserCharacter.prompt_id);
    });

    it('returns 404 for non-owned character', async () => {
      const res = await DELETE(
        makeRequest({ id: fakeOtherUserCharacter.id }, 'DELETE'),
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 when trying to delete a public/predefined character', async () => {
      const res = await DELETE(
        makeRequest({ id: fakePublicCharacter.id }, 'DELETE'),
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('predefined');
    });

    it('returns 404 when character does not exist', async () => {
      const res = await DELETE(
        makeRequest({ id: '00000000-dead-4000-a000-000000000000' }, 'DELETE'),
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 when id is missing', async () => {
      const res = await DELETE(makeRequest({}, 'DELETE'));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Character ID');
    });

    it('returns 400 with invalid JSON body', async () => {
      const request = new Request('http://localhost/api/characters', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const res = await DELETE(request);
      expect(res.status).toBe(400);
    });
  });

  // ─── Security: public characters are immutable ─────────────────────
  describe('security: predefined character immutability', () => {
    it('cannot UPDATE characters where is_public = true', async () => {
      const body = validCreateBody({
        id: fakePublicCharacter.id,
        name: 'Trying to hack Ramona',
      });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(403);
      expect(updatedCharacters).toHaveLength(0);
      expect(updatedPrompts).toHaveLength(0);
    });

    it('cannot DELETE characters where is_public = true', async () => {
      const res = await DELETE(
        makeRequest({ id: fakePublicCharacter.id }, 'DELETE'),
      );
      expect(res.status).toBe(403);
      expect(deletedCharacterIds).toHaveLength(0);
      expect(deletedPromptIds).toHaveLength(0);
    });
  });
});
