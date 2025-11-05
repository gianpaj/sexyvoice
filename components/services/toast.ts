import type React from 'react';
import type { ExternalToast } from 'sonner';
import { toast as sonnerToast } from 'sonner';

import { TOAST_DURATION } from '@/lib/ui-constants';

type PromiseT<T> = Promise<T>;

interface PromiseData<ToastData> {
  loading?: React.ReactNode;
  success?: React.ReactNode | ((data: ToastData) => React.ReactNode);
  error?: React.ReactNode | ((error: Error) => React.ReactNode);
}

const defaultToastOptions: ExternalToast = {
  duration: TOAST_DURATION,
};

export const toast = Object.assign(
  (message: React.ReactNode, data?: ExternalToast) =>
    sonnerToast(message, { ...defaultToastOptions, ...data }),
  {
    ...sonnerToast,
    success: (
      message: React.ReactNode | React.ReactNode,
      data?: ExternalToast,
    ) => sonnerToast.success(message, { ...defaultToastOptions, ...data }),

    info: (message: React.ReactNode | React.ReactNode, data?: ExternalToast) =>
      sonnerToast.info(message, { ...defaultToastOptions, ...data }),

    warning: (
      message: React.ReactNode | React.ReactNode,
      data?: ExternalToast,
    ) => sonnerToast.warning(message, { ...defaultToastOptions, ...data }),

    error: (message: React.ReactNode | React.ReactNode, data?: ExternalToast) =>
      sonnerToast.error(message, { ...defaultToastOptions, ...data }),

    // custom() doesn't use the default duration

    message: (
      message: React.ReactNode | React.ReactNode,
      data?: ExternalToast,
    ) => sonnerToast.message(message, { ...defaultToastOptions, ...data }),

    promise: <ToastData>(
      promise: PromiseT<ToastData>,
      data?: PromiseData<ToastData>,
    ) => sonnerToast.promise(promise, { ...defaultToastOptions, ...data }),

    loading: (
      message: React.ReactNode | React.ReactNode,
      data?: ExternalToast,
    ) => sonnerToast.loading(message, { ...defaultToastOptions, ...data }),
  },
);
