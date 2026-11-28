interface CallCleanup {
  closeSession: () => Promise<void>;
  disconnect: () => Promise<void>;
  flush: () => Promise<void>;
  onCloseFailure: () => void;
}

export async function closeCall({
  closeSession,
  disconnect,
  flush,
  onCloseFailure,
}: CallCleanup) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closeSession(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Call teardown timed out')),
          5000,
        );
      }),
    ]);
  } catch {
    // Stop accepting audio or text before releasing the thread to another call.
    onCloseFailure();
    await disconnect();
  } finally {
    clearTimeout(timeout);
  }
  await flush();
}
