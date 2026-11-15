export const downloadUrl = (
  url: string,
  anchorElement: HTMLAnchorElement,
): Promise<void> => {
  if (!url) {
    return Promise.reject(new Error('URL is required'));
  }

  const filename =
    url.split('/').pop()?.split('?')[0] || `generated_audio_${Date.now()}.mp3`;
  const shouldRemoveAfterClick = !anchorElement.isConnected;

  anchorElement.href = url;
  anchorElement.download = filename;
  anchorElement.rel = 'noopener';
  anchorElement.style.display = 'none';

  if (shouldRemoveAfterClick) {
    document.body.appendChild(anchorElement);
  }

  try {
    anchorElement.click();
  } catch (error) {
    console.error('Failed to download audio', error);
    return Promise.reject(error);
  } finally {
    if (shouldRemoveAfterClick) {
      document.body.removeChild(anchorElement);
    }
  }

  return Promise.resolve();
};

/** Saves an in-memory file, such as joined audio, under `filename`. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
