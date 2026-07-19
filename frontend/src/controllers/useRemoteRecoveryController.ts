import { useEffect, useRef, useState } from "react";

import type { BusyAction } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";

interface RemoteRecoveryOptions {
  autoReconnectEnabled: boolean;
  browserRemoteState: BrowserRemoteSessionState;
  busy: BusyAction;
  controlChannelState: RTCDataChannelState;
  roomJoinedForSelectedDevice: boolean;
  signalGatewayMatchesRoom: boolean;
  onReconnect(attemptCount: number): Promise<void>;
}

export function useRemoteRecoveryController(options: RemoteRecoveryOptions) {
  const [attemptCount, setAttemptCount] = useState(0);
  const [decodeStalledStreak, setDecodeStalledStreak] = useState(0);
  const [status, setStatus] = useState("");
  const onReconnectRef = useRef(options.onReconnect);
  onReconnectRef.current = options.onReconnect;

  useEffect(() => {
    setDecodeStalledStreak((streak) =>
      options.browserRemoteState.videoFlow?.status === "decode_stalled" ? streak + 1 : 0,
    );
  }, [options.browserRemoteState.videoFlow]);

  const decodeStalledPersisted =
    options.browserRemoteState.videoFlow?.status === "decode_stalled" && decodeStalledStreak >= 2;
  const canRecover =
    options.browserRemoteState.stage === "connected" &&
    (options.controlChannelState === "closed" ||
      options.browserRemoteState.videoFlow?.status === "transport_stalled" ||
      decodeStalledPersisted);

  useEffect(() => {
    if (!canRecover) {
      setAttemptCount(0);
      setStatus("");
      return;
    }
    if (
      !options.autoReconnectEnabled ||
      options.busy !== null ||
      !options.roomJoinedForSelectedDevice ||
      !options.signalGatewayMatchesRoom
    ) {
      return;
    }

    const delayMs = Math.min(5000, 900 * 2 ** Math.min(attemptCount, 3));
    setStatus(`自动重连将在 ${Math.ceil(delayMs / 1000)} 秒后尝试`);
    const timer = window.setTimeout(() => {
      setAttemptCount((count) => count + 1);
      void onReconnectRef.current(attemptCount);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    attemptCount,
    canRecover,
    options.autoReconnectEnabled,
    options.busy,
    options.roomJoinedForSelectedDevice,
    options.signalGatewayMatchesRoom,
  ]);

  return {
    autoReconnectAttemptCount: attemptCount,
    autoReconnectStatus: status,
    browserConnectionRecoverable: canRecover,
    decodeStalledStreak,
  };
}
