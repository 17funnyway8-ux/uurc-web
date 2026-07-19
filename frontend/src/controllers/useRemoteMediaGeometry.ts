import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

import type { RemoteStageViewMode } from "../app/remoteControlTypes.js";
import { computeRemoteMediaGeometry, type RemoteMediaGeometry } from "../remote/remoteMediaGeometry.js";

export function useRemoteMediaGeometry(options: {
  stageRef: RefObject<HTMLDivElement | null>;
  viewMode: RemoteStageViewMode;
  primaryVideoId: string;
}) {
  const { stageRef, viewMode, primaryVideoId } = options;
  const geometryRef = useRef<RemoteMediaGeometry | undefined>(undefined);

  const refreshGeometry = useCallback((): RemoteMediaGeometry | undefined => {
    const stage = stageRef.current;
    if (!stage) {
      geometryRef.current = undefined;
      return undefined;
    }

    const stageRect = stage.getBoundingClientRect();
    const video = stage.querySelector<HTMLVideoElement>('video[data-active="true"]') ?? stage.querySelector("video");
    const mediaWidth = video?.videoWidth || Math.round(stageRect.width);
    const mediaHeight = video?.videoHeight || Math.round(stageRect.height);
    const geometry = computeRemoteMediaGeometry({
      containerRect: stageRect,
      mediaWidth,
      mediaHeight,
      objectFit: viewMode === "fill" ? "cover" : "contain",
    });
    geometryRef.current = geometry;
    return geometry;
  }, [stageRef, viewMode]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let activeVideo: HTMLVideoElement | null = null;
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(refreshGeometry) : undefined;
    const updateObservedVideo = () => {
      const nextVideo =
        stage.querySelector<HTMLVideoElement>('video[data-active="true"]') ?? stage.querySelector("video");
      if (nextVideo !== activeVideo) {
        if (activeVideo) {
          activeVideo.removeEventListener("loadedmetadata", refreshGeometry);
          activeVideo.removeEventListener("resize", refreshGeometry);
          activeVideo.removeEventListener("playing", refreshGeometry);
          resizeObserver?.unobserve(activeVideo);
        }
        activeVideo = nextVideo;
        if (activeVideo) {
          activeVideo.addEventListener("loadedmetadata", refreshGeometry);
          activeVideo.addEventListener("resize", refreshGeometry);
          activeVideo.addEventListener("playing", refreshGeometry);
          resizeObserver?.observe(activeVideo);
        }
      }
      refreshGeometry();
    };

    resizeObserver?.observe(stage);
    const mutationObserver =
      typeof MutationObserver === "function" ? new MutationObserver(updateObservedVideo) : undefined;
    mutationObserver?.observe(stage, {
      attributeFilter: ["data-active"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", refreshGeometry, { passive: true });
    document.addEventListener("scroll", refreshGeometry, { capture: true, passive: true });
    updateObservedVideo();
    const frame = requestGeometryFrame(updateObservedVideo);

    return () => {
      cancelGeometryFrame(frame);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refreshGeometry);
      document.removeEventListener("scroll", refreshGeometry, true);
      if (activeVideo) {
        activeVideo.removeEventListener("loadedmetadata", refreshGeometry);
        activeVideo.removeEventListener("resize", refreshGeometry);
        activeVideo.removeEventListener("playing", refreshGeometry);
      }
      geometryRef.current = undefined;
    };
  }, [primaryVideoId, refreshGeometry, stageRef]);

  return { geometryRef, refreshGeometry };
}

function requestGeometryFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
  return window.setTimeout(() => callback(performance.now()), 0);
}

function cancelGeometryFrame(frame: number): void {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frame);
  else window.clearTimeout(frame);
}
