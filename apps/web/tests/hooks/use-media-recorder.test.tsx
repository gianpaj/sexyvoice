// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import useMediaRecorder from '@/hooks/use-media-recorder';

class FakeMediaRecorder extends EventTarget {
  start = vi.fn();
  stop = vi.fn(() => {
    const data = new Event('dataavailable') as Event & { data: Blob };
    data.data = new Blob(['take'], { type: 'audio/webm' });
    this.dispatchEvent(data);
    this.dispatchEvent(new Event('stop'));
  });
}

const fakeStream = () =>
  ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

function stubMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

describe('useMediaRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a blocked microphone through onError', async () => {
    // Browsers reject with a DOMException, which extends Error there.
    stubMediaDevices(() =>
      Promise.reject(
        Object.assign(new Error('Permission denied'), {
          name: 'NotAllowedError',
        }),
      ),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useMediaRecorder({ onError }));

    await act(() => result.current.startRecording());

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NotAllowedError' }),
    );
    expect(result.current.status).toBe('failed');
  });

  it('hands the finished take to onStop', async () => {
    stubMediaDevices(() => Promise.resolve(fakeStream()));
    const onStop = vi.fn();
    const { result } = renderHook(() => useMediaRecorder({ onStop }));

    await act(() => result.current.startRecording());
    expect(result.current.status).toBe('recording');
    act(() => result.current.stopRecording());

    expect(onStop).toHaveBeenCalledWith(expect.any(Blob));
    expect(result.current.mediaBlob?.type).toBe('audio/webm');
    expect(result.current.status).toBe('idle');
  });

  it('reports browsers without MediaRecorder once mounted', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useMediaRecorder({ onError }));

    expect(result.current.supported).toBe(false);
    expect(result.current.status).toBe('failed');
    expect(onError).toHaveBeenCalledOnce();
  });
});
