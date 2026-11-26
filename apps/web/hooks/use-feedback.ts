'use client';

import { useRef, useState } from 'react';

import type {
  FeedbackRating,
  FeedbackSubmission,
  FeedbackTarget,
} from '@/lib/feedback';

export function useFeedback(target: FeedbackTarget) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [rating, setRating] = useState<FeedbackRating>();
  const [error, setError] = useState<'ending' | 'failed'>();

  async function submit(values: Omit<FeedbackSubmission, 'target'>) {
    if (submitting.current) return false;
    submitting.current = true;
    setPending(true);
    setError(undefined);

    try {
      const response = await fetch('/api/feedback', {
        body: JSON.stringify({ ...values, target }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) {
        setError(response.status === 409 ? 'ending' : 'failed');
        return false;
      }
      const result = await response.json();
      if (result.rating !== 'up' && result.rating !== 'down') {
        setError('failed');
        return false;
      }
      setRating(result.rating);
      return true;
    } catch {
      setError('failed');
      return false;
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return {
    clearError: () => setError(undefined),
    error,
    pending,
    rating,
    submit,
  };
}
