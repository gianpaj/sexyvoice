import { useMediaDeviceSelect } from '@livekit/components-react';
import { useEffect, useRef } from 'react';

const AUDIO_DEVICE_STORAGE_KEY = 'sv_audio_device_id';

/**
 * Custom hook for managing persistent audio device selection.
 * Automatically loads the last selected audio device from localStorage
 * and saves new selections for future sessions.
 *
 * @returns The media device select object from useMediaDeviceSelect
 */
export function usePersistentMediaDevice() {
  const deviceSelect = useMediaDeviceSelect({ kind: 'audioinput' });
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
          deviceSelect.setActiveMediaDevice(savedDeviceId);
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
    deviceSelect.setActiveMediaDevice(deviceId);
    localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, deviceId);
  };

  return {
    ...deviceSelect,
    setActiveMediaDevice: setPersistentMediaDevice,
  };
}
