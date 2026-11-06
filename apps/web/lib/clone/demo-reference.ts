import type { DemoCloneSpeaker } from '@/data/demo-clone';

export async function loadDemoCloneReference(
  speaker: DemoCloneSpeaker,
  signal?: AbortSignal,
): Promise<File> {
  const response = await fetch(speaker.reference.src, { signal });
  if (!response.ok)
    throw new Error(`Demo reference unavailable: ${response.status}`);
  return new File([await response.blob()], `${speaker.id}-reference.mp3`, {
    type: 'audio/mpeg',
  });
}
