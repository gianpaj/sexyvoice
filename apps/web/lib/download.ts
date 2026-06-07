// Cross-origin files (e.g. the audio stored on Cloudflare R2 at
// files.sexyvoice.ai) cannot be fetched directly from the browser because the
// storage origin does not send CORS headers. Routing those requests through
// our same-origin `/api/download` proxy avoids the CORS failure while still
// forcing a real "Save As" download with the correct filename.
const toFetchableUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.href);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (isHttp && parsed.origin !== window.location.origin) {
      return `/api/download?url=${encodeURIComponent(parsed.toString())}`;
    }
  } catch {
    // Not an absolute URL (e.g. a blob: or object URL) — fetch it directly.
  }
  return url;
};

export const downloadUrl = async (
  url: string,
  anchorElement: HTMLAnchorElement,
) => {
  try {
    // Create a Blob from the audio source
    const response = await fetch(toFetchableUrl(url));

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }

    const audioBlob = await response.blob();

    // Create a temporary object URL for the Blob
    const objectUrl = window.URL.createObjectURL(audioBlob);

    const filename =
      url.split('/').pop()?.split('?')[0] ||
      `generated_audio_${Date.now()}.mp3`;
    anchorElement.href = objectUrl;
    anchorElement.download = filename;

    // Simulate the click to trigger the download prompt
    anchorElement.click();

    // Essential cleanup: release the temporary URL resource
    window.URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error('Failed to download audio', error);
    throw error;
  }
};
