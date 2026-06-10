'use client';

import { useCallback } from 'react';

// basically Exclude<React.ClassAttributes<T>["ref"], string>
type UserRef<T> =
  | ((instance: T | null) => void)
  | React.RefObject<T | null>
  | null
  | undefined;

const updateRef = <T>(ref: NonNullable<UserRef<T>>, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object' && 'current' in ref) {
    ref.current = value;
  }
};

export const useComposedRef = <T extends HTMLElement>(
  libRef: React.RefObject<T | null>,
  userRef: UserRef<T>,
) => {
  return useCallback(
    (instance: T | null) => {
      libRef.current = instance;
      if (userRef) {
        updateRef(userRef, instance);
      }
    },
    [libRef, userRef],
  );
};

export default useComposedRef;
