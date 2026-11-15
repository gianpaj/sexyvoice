import { useEffect, useState } from 'react';

import { levelFromDb } from '@/lib/audio-level';

export const useMultibandTrackVolume = (
  mediaStream: MediaStream | null,
  bands = 5,
  loPass = 100,
  hiPass = 600,
) => {
  const [frequencyBands, setFrequencyBands] = useState<Float32Array[]>([]);

  useEffect(() => {
    if (!mediaStream) {
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(mediaStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const updateVolume = () => {
      analyser.getFloatFrequencyData(dataArray);
      const levels = dataArray.slice(loPass, hiPass).map(levelFromDb);
      const chunkSize = Math.ceil(levels.length / bands);
      const chunks: Float32Array[] = [];
      for (let i = 0; i < bands; i++) {
        chunks.push(levels.slice(i * chunkSize, (i + 1) * chunkSize));
      }

      setFrequencyBands(chunks);
    };

    const interval = setInterval(updateVolume, 10);

    return () => {
      source.disconnect();
      clearInterval(interval);
      ctx.close();
    };
  }, [mediaStream, loPass, hiPass, bands]);

  return mediaStream ? frequencyBands : [];
};
