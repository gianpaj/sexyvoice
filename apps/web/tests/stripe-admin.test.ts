// biome-ignore lint/performance/noNamespaceImport: tests assert across the mocked Sentry module
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrRetrieveCustomer, stripe } from '@/lib/stripe/stripe-admin';
import { createClient } from '@/lib/supabase/server';

// Mock Stripe customers API
vi.mock('stripe', () => {
  const mockStripe = {
    customers: {
      create: vi.fn(),
      list: vi.fn(),
      retrieve: vi.fn(),
      search: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    default: class MockStripe {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: vitest 4
        return mockStripe;
      }
    },
  };
});

describe('createOrRetrieveCustomer()', () => {
  const userId = 'user_123';
  const email = 'test@example.com';
  const stripeCustomerId = 'cus_test_123';

  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Supabase mock
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('With existing Stripe ID', () => {
    it('should return existing Stripe customer ID when metadata matches', async () => {
      const existingCustomer = {
        id: stripeCustomerId,
        metadata: {
          supabaseUUID: userId,
        },
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.retrieve).mockResolvedValue(existingCustomer);

      const result = await createOrRetrieveCustomer(
        userId,
        email,
        stripeCustomerId,
      );

      expect(result).toBe(stripeCustomerId);
      expect(stripe.customers.retrieve).toHaveBeenCalledWith(stripeCustomerId);
      expect(stripe.customers.update).not.toHaveBeenCalled();
    });

    it('should update metadata and return ID when metadata is missing', async () => {
      const customerWithoutMetadata = {
        id: stripeCustomerId,
        metadata: {},
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.retrieve).mockResolvedValue(
        customerWithoutMetadata,
      );
      vi.mocked(stripe.customers.update).mockResolvedValue({
        ...customerWithoutMetadata,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(
        userId,
        email,
        stripeCustomerId,
      );

      expect(result).toBe(stripeCustomerId);
      expect(stripe.customers.update).toHaveBeenCalledWith(stripeCustomerId, {
        metadata: { supabaseUUID: userId },
      });
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      // Verify the chained methods are called correctly
      // Verify the chain was called correctly
      // The mock returns an object with update and eq methods
      const mockFromReturn = mockSupabase.from.mock.results[0].value;
      expect(mockFromReturn.update).toHaveBeenCalledWith({
        stripe_id: stripeCustomerId,
      });
      expect(mockFromReturn.eq).toHaveBeenCalledWith('id', userId);
    });

    it('should throw error when Stripe ID belongs to different user', async () => {
      const differentUserId = 'user_456';
      const customerWithDifferentMetadata = {
        id: stripeCustomerId,
        metadata: {
          supabaseUUID: differentUserId,
        },
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.retrieve).mockResolvedValue(
        customerWithDifferentMetadata,
      );

      await expect(
        createOrRetrieveCustomer(userId, email, stripeCustomerId),
      ).rejects.toThrow(
        `Stripe customer ${stripeCustomerId} already linked to Supabase user ${differentUserId}`,
      );

      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should handle deleted Stripe customer gracefully', async () => {
      vi.mocked(stripe.customers.retrieve).mockResolvedValue({
        deleted: true,
        id: stripeCustomerId,
        object: 'customer',
      } as unknown as any);

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: 'cus_new_123',
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(
        userId,
        email,
        stripeCustomerId,
      );

      expect(result).toBe('cus_new_123');
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should handle API error when retrieving existing customer', async () => {
      const apiError = new Error('API rate limit exceeded');

      vi.mocked(stripe.customers.retrieve).mockRejectedValue(apiError);
      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: 'cus_new_123',
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(
        userId,
        email,
        stripeCustomerId,
      );

      expect(result).toBe('cus_new_123');
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe('Search by metadata', () => {
    it('should find customer by supabaseUUID metadata', async () => {
      const existingCustomer = {
        id: stripeCustomerId,
        metadata: {
          supabaseUUID: userId,
        },
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [existingCustomer],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(stripeCustomerId);
      expect(stripe.customers.search).toHaveBeenCalledWith({
        query: `metadata['supabaseUUID']:'${userId}'`,
      });
    });

    it('should log warning when multiple customers found by metadata', async () => {
      const customer1 = {
        id: 'cus_1',
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any;
      const customer2 = {
        id: 'cus_2',
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [customer1, customer2],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe('cus_1');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Multiple Stripe customers found for Supabase user',
        expect.objectContaining({
          customerCount: 2,
          customerIds: ['cus_1', 'cus_2'],
          user: { email, id: userId },
        }),
      );
    });
  });

  describe('Search by email', () => {
    it('should find customer by email when metadata search fails', async () => {
      const existingCustomer = {
        email,
        id: stripeCustomerId,
        metadata: {},
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [existingCustomer],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.update).mockResolvedValue({
        ...existingCustomer,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(stripeCustomerId);
      expect(stripe.customers.list).toHaveBeenCalledWith({ email });
      expect(stripe.customers.update).toHaveBeenCalledWith(stripeCustomerId, {
        metadata: { supabaseUUID: userId },
      });
    });

    it('should log warning when multiple customers found by email', async () => {
      const customer1 = {
        email,
        id: 'cus_email_1',
        metadata: {},
        object: 'customer',
      } as unknown as any;
      const customer2 = {
        email,
        id: 'cus_email_2',
        metadata: {},
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [customer1, customer2],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.update).mockResolvedValue({
        ...customer1,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe('cus_email_1');
      expect(Sentry.captureMessage).not.toHaveBeenCalledWith(
        expect.stringContaining('Multiple customers found for email'),
        expect.anything(),
      );
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Multiple Stripe customers found for email',
        expect.objectContaining({
          customerCount: 2,
          customerIds: ['cus_email_1', 'cus_email_2'],
          user: { email, id: userId },
        }),
      );
    });
  });

  describe('Create new customer', () => {
    it('should create new customer when none exists', async () => {
      const newCustomerId = 'cus_new_456';

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: newCustomerId,
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(newCustomerId);
      expect(stripe.customers.create).toHaveBeenCalledWith({
        email,
        metadata: { supabaseUUID: userId },
      });
      expect(Sentry.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created new Stripe customer'),
        expect.any(Object),
      );
    });

    it('should update Supabase profile with new Stripe ID', async () => {
      const newCustomerId = 'cus_new_789';

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: newCustomerId,
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });

      mockSupabase.from.mockReturnValue({
        eq: mockEq,
        update: mockUpdate,
      });

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(newCustomerId);
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      // Verify the chained methods are called correctly
      // Verify the chain was called correctly
      // The mock returns an object with update and eq methods
      const mockFromReturn = mockSupabase.from.mock.results[0].value;
      expect(mockFromReturn.update).toHaveBeenCalledWith({
        stripe_id: newCustomerId,
      });
      expect(mockFromReturn.eq).toHaveBeenCalledWith('id', userId);
    });
  });

  describe('Metadata updates', () => {
    it('should handle errors when updating customer metadata', async () => {
      const customerWithoutMetadata = {
        id: stripeCustomerId,
        metadata: {},
        object: 'customer',
      } as unknown as any;

      const updateError = new Error('Failed to update customer metadata');

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [customerWithoutMetadata],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.update).mockRejectedValue(updateError);

      await expect(createOrRetrieveCustomer(userId, email)).rejects.toThrow(
        updateError,
      );

      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should preserve existing metadata when updating', async () => {
      const customerWithExistingMetadata = {
        id: stripeCustomerId,
        metadata: {
          existingKey: 'existingValue',
        },
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [customerWithExistingMetadata],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.update).mockResolvedValue({
        ...customerWithExistingMetadata,
        metadata: {
          existingKey: 'existingValue',
          supabaseUUID: userId,
        },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(stripeCustomerId);
      expect(stripe.customers.update).toHaveBeenCalledWith(stripeCustomerId, {
        metadata: {
          existingKey: 'existingValue',
          supabaseUUID: userId,
        },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty existing Stripe ID', async () => {
      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: 'cus_new_123',
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email, null);

      expect(result).toBe('cus_new_123');
    });

    it('should handle undefined existing Stripe ID', async () => {
      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: 'cus_new_123',
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email, undefined);

      expect(result).toBe('cus_new_123');
    });

    it('should handle Supabase update failure gracefully', async () => {
      const newCustomerId = 'cus_new_999';
      const supabaseError = new Error('Database connection failed');

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: newCustomerId,
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      mockSupabase.from.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: supabaseError }),
        update: vi.fn().mockReturnThis(),
      });

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe('cus_new_999');
    });

    it('should work with special characters in email', async () => {
      const specialEmail = 'test+special@example.co.uk';
      const newCustomerId = 'cus_special_123';

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        email: specialEmail,
        id: newCustomerId,
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, specialEmail);

      expect(result).toBe(newCustomerId);
      expect(stripe.customers.create).toHaveBeenCalledWith({
        email: specialEmail,
        metadata: { supabaseUUID: userId },
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should complete full workflow: search metadata -> search email -> create', async () => {
      const newCustomerId = 'cus_workflow_123';

      // First call: metadata search returns nothing
      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      // Second call: email search returns nothing
      vi.mocked(stripe.customers.list).mockResolvedValue({
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      } as unknown as any);

      // Create new customer
      vi.mocked(stripe.customers.create).mockResolvedValue({
        email,
        id: newCustomerId,
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(newCustomerId);
      expect(stripe.customers.search).toHaveBeenCalledTimes(1);
      expect(stripe.customers.list).toHaveBeenCalledTimes(1);
      expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    });

    it('should skip email search if metadata search succeeds', async () => {
      const existingCustomer = {
        id: stripeCustomerId,
        metadata: { supabaseUUID: userId },
        object: 'customer',
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        data: [existingCustomer],
        has_more: false,
        object: 'search_result_list',
        url: '/v1/customers/search',
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(stripeCustomerId);
      // Email search should not be called
      expect(stripe.customers.list).not.toHaveBeenCalled();
      expect(stripe.customers.create).not.toHaveBeenCalled();
    });
  });
});
