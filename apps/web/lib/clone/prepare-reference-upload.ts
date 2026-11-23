type ConvertToMp3 = (file: File, format: 'mp3') => Promise<Blob>;

export async function prepareReferenceUpload(
  file: File,
  ensureLoaded: () => Promise<void>,
  convert: ConvertToMp3,
): Promise<File> {
  const mime = file.type.split(';')[0]?.trim();
  if (
    mime === 'audio/mp4' ||
    mime === 'audio/m4a' ||
    mime === 'audio/x-m4a' ||
    /\.m4a$/i.test(file.name)
  ) {
    await ensureLoaded();
    const mp3 = await convert(file, 'mp3');
    return new File([mp3], `${file.name.replace(/\.[^.]+$/, '')}.mp3`, {
      type: 'audio/mpeg',
    });
  }

  if (mime === 'audio/wave' || mime === 'audio/vnd.wave') {
    return new File([file], file.name, {
      lastModified: file.lastModified,
      type: 'audio/wav',
    });
  }

  return file;
}
