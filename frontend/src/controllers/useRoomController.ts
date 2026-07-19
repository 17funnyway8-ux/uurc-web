import { useCallback, useState } from "react";

import type { RemoteControlBootstrap, RoomJoinResult } from "@uurc/shared/types";

import type { RoomJoinContext } from "../app/remoteControlTypes.js";

export function useRoomController() {
  const [roomResponse, setRoomResponse] = useState<RoomJoinResult | null>(null);
  const [roomJoinContext, setRoomJoinContext] = useState<RoomJoinContext | null>(null);
  const [remoteBootstrap, setRemoteBootstrap] = useState<RemoteControlBootstrap | null>(null);

  const resetRoom = useCallback(() => {
    setRoomResponse(null);
    setRoomJoinContext(null);
    setRemoteBootstrap(null);
  }, []);

  return {
    roomResponse,
    setRoomResponse,
    roomJoinContext,
    setRoomJoinContext,
    remoteBootstrap,
    setRemoteBootstrap,
    resetRoom,
  };
}
