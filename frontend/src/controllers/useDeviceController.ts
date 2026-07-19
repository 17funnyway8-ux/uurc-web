import { useCallback, useState } from "react";

import type { UuDeviceGroups } from "@uurc/shared/types";

export const REMOTE_ASSISTANCE_DEFAULT_TARGET_PLATFORM = 1;

export function useDeviceController() {
  const [devices, setDevices] = useState<UuDeviceGroups>(createEmptyDeviceGroups);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [selectedDeviceIdState, setSelectedDeviceId] = useState("");
  const [forceJoin, setForceJoin] = useState(false);
  const [assistanceConnectId, setAssistanceConnectId] = useState("");
  const [assistanceConnectCode, setAssistanceConnectCode] = useState("");
  const [assistanceNotice, setAssistanceNotice] = useState("");
  const [assistanceTargetPlatform, setAssistanceTargetPlatform] = useState<number>(
    REMOTE_ASSISTANCE_DEFAULT_TARGET_PLATFORM,
  );

  const resetDevices = useCallback(() => {
    setDevices(createEmptyDeviceGroups());
    setDevicesLoaded(false);
    setSelectedDeviceId("");
    setForceJoin(false);
    setAssistanceConnectId("");
    setAssistanceConnectCode("");
    setAssistanceNotice("");
    setAssistanceTargetPlatform(REMOTE_ASSISTANCE_DEFAULT_TARGET_PLATFORM);
  }, []);

  return {
    devices,
    setDevices,
    devicesLoaded,
    setDevicesLoaded,
    selectedDeviceIdState,
    setSelectedDeviceId,
    forceJoin,
    setForceJoin,
    assistanceConnectId,
    setAssistanceConnectId,
    assistanceConnectCode,
    setAssistanceConnectCode,
    assistanceNotice,
    setAssistanceNotice,
    assistanceTargetPlatform,
    setAssistanceTargetPlatform,
    resetDevices,
  };
}

function createEmptyDeviceGroups(): UuDeviceGroups {
  return { desktopDevices: [], mobileDevices: [], tvDevices: [] };
}
