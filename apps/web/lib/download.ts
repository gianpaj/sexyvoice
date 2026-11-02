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
