const AUDIO_FILE_EXTENSIONS = [
  '.aac',
  '.ac3',
  '.aif',
  '.aifc',
  '.aiff',
  '.amr',
  '.ape',
  '.au',
  '.caf',
  '.flac',
  '.m4a',
  '.m4b',
  '.mp2',
  '.mp3',
  '.mpga',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.wave',
  '.weba',
  '.webm',
  '.wma',
];

export const AUDIO_FILE_ACCEPT = AUDIO_FILE_EXTENSIONS.join(',');

export function isAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith('audio/') ||
    AUDIO_FILE_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}
