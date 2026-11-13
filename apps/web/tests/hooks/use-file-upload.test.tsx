// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFileUpload } from '@/hooks/use-file-upload';

const accept = 'audio/mpeg,audio/wav,.opus';
const audio = (name: string, type: string, bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type });

describe('useFileUpload', () => {
  it('keeps an accepted file and reports the pick', () => {
    const onFileChosen = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({ accept, maxSize: 10, onFileChosen }),
    );
    const file = audio('take.wav', 'audio/wav');

    act(() => result.current.addFile(file));

    expect(result.current.file).toBe(file);
    expect(result.current.error).toBeNull();
    expect(onFileChosen).toHaveBeenCalledWith(true);
  });

  it('accepts a listed extension whatever the reported type', () => {
    const { result } = renderHook(() => useFileUpload({ accept, maxSize: 10 }));

    act(() => result.current.addFile(audio('voice.opus', '')));

    expect(result.current.file?.name).toBe('voice.opus');
  });

  it.each([
    ['fileTooLarge', audio('long.wav', 'audio/wav', 11)],
    ['invalidFileType', audio('song.flac', 'audio/flac')],
  ])('rejects with %s and drops the previous file', (code, rejected) => {
    const onFileChosen = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({ accept, maxSize: 10, onFileChosen }),
    );

    act(() => result.current.addFile(audio('take.wav', 'audio/wav')));
    act(() => result.current.addFile(rejected));

    expect(result.current.file).toBeNull();
    expect(result.current.error).toBe(code);
    expect(onFileChosen).toHaveBeenLastCalledWith(false);
  });
});
