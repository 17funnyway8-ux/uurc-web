import type { KeyboardEvent } from "react";

import type { StreamerMouseButtonKind } from "@uurc/shared/streamer/input";

import type { RemoteStageViewMode } from "../app/remoteControlTypes.js";
import { toAndroidKeyCodeFromDomEvent } from "./androidKeyCodes.js";
import { clientPointToRemoteMedia, computeRemoteMediaGeometry } from "./remoteMediaGeometry.js";

interface RemotePointerLike {
  clientX: number;
  clientY: number;
  currentTarget: HTMLDivElement;
}

export function toRemoteMousePosition(
  event: RemotePointerLike,
  viewMode: RemoteStageViewMode = "fit",
): {
  absX: number;
  absY: number;
  surfaceWidth: number;
  surfaceHeight: number;
} {
  const stageRect = event.currentTarget.getBoundingClientRect();
  const video =
    event.currentTarget.querySelector<HTMLVideoElement>('video[data-active="true"]') ??
    event.currentTarget.querySelector("video");
  const videoWidth = video?.videoWidth || Math.round(stageRect.width);
  const videoHeight = video?.videoHeight || Math.round(stageRect.height);
  const geometry = computeRemoteMediaGeometry({
    containerRect: stageRect,
    mediaWidth: videoWidth,
    mediaHeight: videoHeight,
    objectFit: viewMode === "fill" ? "cover" : "contain",
  });
  const position = geometry
    ? clientPointToRemoteMedia(geometry, { x: event.clientX, y: event.clientY })
    : { x: 0, y: 0 };
  return {
    absX: Math.round(position.x * videoWidth),
    absY: Math.round(position.y * videoHeight),
    surfaceWidth: videoWidth,
    surfaceHeight: videoHeight,
  };
}

export function toRemoteMouseButton(button: number): StreamerMouseButtonKind {
  if (button === 1) return "tertiary";
  if (button === 2) return "secondary";
  if (button === 3) return "back";
  if (button === 4) return "forward";
  return "primary";
}

export function toRemoteKeyValue(event: KeyboardEvent): string | number {
  return toAndroidKeyCodeFromDomEvent(event);
}
