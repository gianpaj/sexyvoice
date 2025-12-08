import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrRetrieveCustomer, stripe } from '@/lib/stripe/stripe-admin';
import { createClient } from '@/lib/supabase/server';

// Mock Stripe customers API
vi.mock('stripe', () => {
  const mockStripe = {
    customers: {
      retrieve: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
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
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
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
        object: 'customer',
        metadata: {
          supabaseUUID: userId,
        },
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
        object: 'customer',
        metadata: {},
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
        object: 'customer',
        metadata: {
          supabaseUUID: differentUserId,
        },
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
        id: stripeCustomerId,
        object: 'customer',
        deleted: true,
      } as unknown as any);

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: 'cus_new_123',
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(
        userId,
        email,
        stripeCustomerId,
      );

      expect(result).toBe('cus_new_123');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('deleted'),
        expect.any(Object),
      );
    });

    it('should handle API error when retrieving existing customer', async () => {
      const apiError = new Error('API rate limit exceeded');

      vi.mocked(stripe.customers.retrieve).mockRejectedValue(apiError);
      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: 'cus_new_123',
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(
        userId,
        email,
        stripeCustomerId,
      );

      expect(result).toBe('cus_new_123');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        apiError,
        expect.any(Object),
      );
    });
  });

  describe('Search by metadata', () => {
    it('should find customer by supabaseUUID metadata', async () => {
      const existingCustomer = {
        id: stripeCustomerId,
        object: 'customer',
        metadata: {
          supabaseUUID: userId,
        },
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [existingCustomer],
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
        object: 'customer',
        metadata: { supabaseUUID: userId },
      } as unknown as any;
      const customer2 = {
        id: 'cus_2',
        object: 'customer',
        metadata: { supabaseUUID: userId },
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [customer1, customer2],
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe('cus_1');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Multiple customers found'),
        expect.objectContaining({
          level: 'warning',
          extra: expect.objectContaining({
            customerCount: 2,
            userId,
          }),
        }),
      );
    });
  });

  describe('Search by email', () => {
    it('should find customer by email when metadata search fails', async () => {
      const existingCustomer = {
        id: stripeCustomerId,
        object: 'customer',
        email,
        metadata: {},
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [existingCustomer],
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
        id: 'cus_email_1',
        object: 'customer',
        email,
        metadata: {},
      } as unknown as any;
      const customer2 = {
        id: 'cus_email_2',
        object: 'customer',
        email,
        metadata: {},
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [customer1, customer2],
      } as unknown as any);

      vi.mocked(stripe.customers.update).mockResolvedValue({
        ...customer1,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe('cus_email_1');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Multiple customers found for email'),
        expect.objectContaining({
          level: 'warning',
          extra: expect.objectContaining({
            customerCount: 2,
            email,
            userId,
          }),
        }),
      );
    });
  });

  describe('Create new customer', () => {
    it('should create new customer when none exists', async () => {
      const newCustomerId = 'cus_new_456';

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: newCustomerId,
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
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
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: newCustomerId,
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });

      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
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
        object: 'customer',
        metadata: {},
      } as unknown as any;

      const updateError = new Error('Failed to update customer metadata');

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [customerWithoutMetadata],
      } as unknown as any);

      vi.mocked(stripe.customers.update).mockRejectedValue(updateError);

      await expect(createOrRetrieveCustomer(userId, email)).rejects.toThrow(
        updateError,
      );

      expect(Sentry.captureException).toHaveBeenCalledWith(
        updateError,
        expect.objectContaining({
          level: 'error',
          extra: expect.objectContaining({
            customerId: stripeCustomerId,
            email,
            userId,
          }),
        }),
      );
    });

    it('should preserve existing metadata when updating', async () => {
      const customerWithExistingMetadata = {
        id: stripeCustomerId,
        object: 'customer',
        metadata: {
          existingKey: 'existingValue',
        },
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [customerWithExistingMetadata],
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
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: 'cus_new_123',
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email, null);

      expect(result).toBe('cus_new_123');
    });

    it('should handle undefined existing Stripe ID', async () => {
      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: 'cus_new_123',
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email, undefined);

      expect(result).toBe('cus_new_123');
    });

    it('should handle Supabase update failure gracefully', async () => {
      const newCustomerId = 'cus_new_999';
      const supabaseError = new Error('Database connection failed');

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: newCustomerId,
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
      } as unknown as any);

      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: supabaseError }),
      });

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe('cus_new_999');
    });

    it('should work with special characters in email', async () => {
      const specialEmail = 'test+special@example.co.uk';
      const newCustomerId = 'cus_special_123';

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: newCustomerId,
        object: 'customer',
        email: specialEmail,
        metadata: { supabaseUUID: userId },
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
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [],
      } as unknown as any);

      // Second call: email search returns nothing
      vi.mocked(stripe.customers.list).mockResolvedValue({
        object: 'list',
        url: '/v1/customers',
        has_more: false,
        data: [],
      } as unknown as any);

      // Create new customer
      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: newCustomerId,
        object: 'customer',
        email,
        metadata: { supabaseUUID: userId },
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
        object: 'customer',
        metadata: { supabaseUUID: userId },
      } as unknown as any;

      vi.mocked(stripe.customers.search).mockResolvedValue({
        object: 'search_result_list',
        url: '/v1/customers/search',
        has_more: false,
        data: [existingCustomer],
      } as unknown as any);

      const result = await createOrRetrieveCustomer(userId, email);

      expect(result).toBe(stripeCustomerId);
      // Email search should not be called
      expect(stripe.customers.list).not.toHaveBeenCalled();
      expect(stripe.customers.create).not.toHaveBeenCalled();
    });
  });
});
