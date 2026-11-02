import { describe, expect, it } from 'vitest';

import { isDisposableEmail } from '@/lib/disposable-email';

describe('isDisposableEmail', () => {
  it('flags domains from the disposable-email-domains-js package', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@sharklasers.com')).toBe(true);
  });

  it('flags domains only present in the amieiro denyDomains list', () => {
    // These were caught by amieiro but not the npm package in production data.
    expect(isDisposableEmail('user@aspensif.com')).toBe(true);
    expect(isDisposableEmail('user@brixozu.com')).toBe(true);
  });

  it('is case-insensitive on the domain', () => {
    expect(isDisposableEmail('User@ASPENSIF.com')).toBe(true);
  });

  it('allows legitimate providers', () => {
    expect(isDisposableEmail('someone@gmail.com')).toBe(false);
    expect(isDisposableEmail('someone@outlook.com')).toBe(false);
    expect(isDisposableEmail('person@company.co')).toBe(false);
  });

  it('returns false for strings without a usable domain', () => {
    expect(isDisposableEmail('notanemail')).toBe(false);
    expect(isDisposableEmail('trailing@')).toBe(false);
  });
});
