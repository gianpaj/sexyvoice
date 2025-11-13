export const downloadUrl = async (
  url: string,
  anchorElement: HTMLAnchorElement,
) => {
  try {
    // Create a Blob from the audio source
    const response = await fetch(url);
    const audioBlob = await response.blob();

    // Create a temporary object URL for the Blob
    const objectUrl = window.URL.createObjectURL(audioBlob);

    anchorElement.href = objectUrl;
    anchorElement.download = `generated_audio_${Date.now()}.mp3`;

    // Simulate the click to trigger the download prompt
    anchorElement.click();

    // Essential cleanup: release the temporary URL resource
    window.URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error('Failed to download audio', error);
    throw error;
  }
};
