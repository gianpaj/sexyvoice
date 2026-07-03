import { describe, expect, it } from 'vitest';

import { isCreditTransactionReferenceConflict } from '@/lib/supabase/queries';

describe('credit transaction reference conflicts', () => {
  it('recognizes reference conflicts reported in PostgREST details', () => {
    expect(
      isCreditTransactionReferenceConflict({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (reference_id)=(pi_123) already exists.',
      }),
    ).toBe(true);
  });

  it('ignores unrelated unique constraint violations', () => {
    expect(
      isCreditTransactionReferenceConflict({
        code: '23505',
        message:
          'duplicate key value violates unique constraint users_email_key',
        details: 'Key (email)=(person@example.com) already exists.',
      }),
    ).toBe(false);
  });
});
