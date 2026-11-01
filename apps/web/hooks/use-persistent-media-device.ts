import { useMediaDeviceSelect } from '@livekit/components-react';
import { useEffect, useRef } from 'react';

const AUDIO_DEVICE_STORAGE_KEY = 'sv_audio_device_id';

function handleDeviceSelectionError(error: unknown) {
  console.warn('Failed to select audio input device:', error);
}

/**
 * Custom hook for managing persistent audio device selection.
 * Automatically loads the last selected audio device from localStorage
 * and saves new selections for future sessions.
 *
 * Firefox hides device IDs and labels until the page has used the
 * microphone, even with permission granted. `requestPermissions` lets
 * LiveKit briefly open the microphone to list them; set it only after the
 * user asks for the list.
 *
 * @returns The media device select object from useMediaDeviceSelect
 */
export function usePersistentMediaDevice({
  requestPermissions = false,
}: {
  requestPermissions?: boolean;
} = {}) {
  const deviceSelect = useMediaDeviceSelect({
    kind: 'audioinput',
    requestPermissions,
  });
  const hasInitialized = useRef(false);

  // Load saved device on mount and when devices change
  useEffect(() => {
    if (
      !hasInitialized.current &&
      deviceSelect.devices.length > 0 &&
      deviceSelect.activeDeviceId === undefined
    ) {
      const savedDeviceId = localStorage.getItem(AUDIO_DEVICE_STORAGE_KEY);
      if (savedDeviceId) {
        const deviceExists = deviceSelect.devices.some(
          (device) => device.deviceId === savedDeviceId,
        );
        if (deviceExists) {
          deviceSelect
            .setActiveMediaDevice(savedDeviceId)
            .catch(handleDeviceSelectionError);
        }
      }
      hasInitialized.current = true;
    }
  }, [
    deviceSelect.devices,
    deviceSelect.activeDeviceId,
    deviceSelect.setActiveMediaDevice,
  ]);

  /**
   * Set the active media device and persist it to localStorage
   * @param deviceId - The device ID to set as active
   */
  const setPersistentMediaDevice = (deviceId: string) => {
    deviceSelect
      .setActiveMediaDevice(deviceId)
      .catch(handleDeviceSelectionError);
    localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, deviceId);
  };

  return {
    ...deviceSelect,
    setActiveMediaDevice: setPersistentMediaDevice,
  };
}
