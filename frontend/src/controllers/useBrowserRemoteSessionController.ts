import { useEffect, useRef, useState } from "react";

import type { DecodedStreamerCursorShape } from "@uurc/shared/streamer/controlChannelDecode";
import { buildDefaultStreamerConnectOptionsBase64 } from "@uurc/shared/streamer/connectOptions";
import { STREAMER_CLIENT_TYPES, STREAMER_CONTROL_CONNECT_TYPES } from "@uurc/shared/streamer/connectOptionsModel";
import { buildStreamerControlStreamerDataJson } from "@uurc/shared/streamer/controlConfig";

import { sendRemoteSignalControl, sendRemoteSignalSoac } from "../api/remoteSignalApi.js";
import { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { REMOTE_CURSOR_LOCAL_RENDERING_ENABLED } from "../remote/remoteCursor.js";
import { createAppControlId, createIdleBrowserRemoteState } from "../remote/remoteSessionUiModel.js";

interface StartBrowserRemoteSessionInput {
  deviceId: string;
  forceRelay: boolean | undefined;
  gzipSdp: boolean;
  remoteAssistance: boolean;
  targetPlatform: number | undefined;
  onRemoteClipboard(text: string): void;
  onRemoteCursorShape(shape: DecodedStreamerCursorShape | null): void;
  onRemoteStream(stream: MediaStream): void;
}

export function useBrowserRemoteSessionController() {
  const sessionRef = useRef<BrowserRemoteSession | null>(null);
  const [state, setState] = useState<BrowserRemoteSessionState>(createIdleBrowserRemoteState);

  useEffect(
    () => () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    },
    [],
  );

  function close(): void {
    const closedState = sessionRef.current?.close();
    sessionRef.current = null;
    setState(closedState ?? createIdleBrowserRemoteState());
  }

  async function start(input: StartBrowserRemoteSessionInput): Promise<BrowserRemoteSession> {
    const appControlId = createAppControlId();
    const session = new BrowserRemoteSession({
      api: {
        sendSignalControl: sendRemoteSignalControl,
        sendSignalSoac: sendRemoteSignalSoac,
      },
      onRemoteStream: input.onRemoteStream,
      onRemoteClipboard: input.onRemoteClipboard,
      onRemoteCursorShape: input.onRemoteCursorShape,
      onStateChange: setState,
    });
    sessionRef.current = session;
    const sessionState = await session.start({
      appControlId,
      appDataBase64: buildDefaultStreamerConnectOptionsBase64({
        deviceId: input.deviceId,
        clientType:
          input.targetPlatform === STREAMER_CLIENT_TYPES.Client_MAC
            ? STREAMER_CLIENT_TYPES.Client_MAC
            : STREAMER_CLIENT_TYPES.Client_ANDROID,
        controlConnectType: input.remoteAssistance
          ? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Assistance
          : STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal,
        cursorCapture: !REMOTE_CURSOR_LOCAL_RENDERING_ENABLED,
      }),
      streamerData: buildStreamerControlStreamerDataJson({ controlId: appControlId }),
      forceRelay: input.forceRelay,
      gzipSdp: input.gzipSdp,
      targetPlatform: input.targetPlatform,
    });
    setState(sessionState);
    return session;
  }

  return { close, sessionRef, start, state, setState };
}
