import { useEffect, useState } from "react";

import {
  DEFAULT_STREAMER_FPS,
  DEFAULT_STREAMER_VIDEO_QUALITY,
  isStreamerFps,
  isStreamerVideoQuality,
  type StreamerFps,
  type StreamerVideoQuality,
} from "../remote/remoteControlPreferences.js";
import type { ConnectionRouteMode, RemoteStageViewMode, SdpTransportMode } from "../app/remoteControlTypes.js";

export function useRemoteControlPreferences(signalServerCount: number) {
  const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(true);
  const [sdpTransportMode, setSdpTransportMode] = useState<SdpTransportMode>("gzip");
  const [connectionRouteMode, setConnectionRouteMode] = useState<ConnectionRouteMode>("auto");
  const [autoConnect, setAutoConnect] = useState<boolean>(readAutoConnectPreference);
  const [remoteStageViewMode, setRemoteStageViewMode] = useState<RemoteStageViewMode>("fit");
  const [signalServerIndex, setSignalServerIndex] = useState(0);
  const [browserWebRtcUnavailableReason] = useState(detectBrowserWebRtcUnavailableReason);
  const [fps, setFps] = useState<StreamerFps>(readFpsPreference);
  const [videoQuality, setVideoQuality] = useState<StreamerVideoQuality>(readVideoQualityPreference);

  useEffect(() => {
    if (signalServerCount > 0 && signalServerIndex >= signalServerCount) {
      setSignalServerIndex(0);
    }
  }, [signalServerCount, signalServerIndex]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem("uurc.autoConnect", autoConnect ? "true" : "false");
    } catch {
      // Ignore persistence failures in private or sandboxed browser contexts.
    }
  }, [autoConnect]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem("uurc.fps", String(fps));
    } catch {
      // Ignore persistence failures in private or sandboxed browser contexts.
    }
  }, [fps]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem("uurc.videoQuality", String(videoQuality));
    } catch {
      // Ignore persistence failures in private or sandboxed browser contexts.
    }
  }, [videoQuality]);

  return {
    autoReconnectEnabled,
    setAutoReconnectEnabled,
    sdpTransportMode,
    setSdpTransportMode,
    connectionRouteMode,
    setConnectionRouteMode,
    autoConnect,
    setAutoConnect,
    remoteStageViewMode,
    setRemoteStageViewMode,
    signalServerIndex,
    setSignalServerIndex,
    browserWebRtcUnavailableReason,
    fps,
    setFps,
    videoQuality,
    setVideoQuality,
  };
}

function readAutoConnectPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem("uurc.autoConnect") !== "false";
  } catch {
    return true;
  }
}

function readFpsPreference(): StreamerFps {
  try {
    const raw = globalThis.localStorage?.getItem("uurc.fps");
    return isStreamerFps(raw) ? raw : DEFAULT_STREAMER_FPS;
  } catch {
    return DEFAULT_STREAMER_FPS;
  }
}

function readVideoQualityPreference(): StreamerVideoQuality {
  try {
    const raw = globalThis.localStorage?.getItem("uurc.videoQuality");
    return isStreamerVideoQuality(raw) ? raw : DEFAULT_STREAMER_VIDEO_QUALITY;
  } catch {
    return DEFAULT_STREAMER_VIDEO_QUALITY;
  }
}

function detectBrowserWebRtcUnavailableReason(): string {
  if (typeof RTCPeerConnection !== "function") {
    return "当前浏览器未启用 WebRTC，无法建立远控画面。请允许 WebRTC 后重试。";
  }

  try {
    const peer = new RTCPeerConnection({ iceServers: [] });
    peer.close();
    return "";
  } catch {
    return "当前浏览器无法创建 WebRTC 连接。请检查浏览器隐私设置或扩展拦截后重试。";
  }
}
