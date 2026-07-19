import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { DecodedStreamerCursorShape } from "@uurc/shared/streamerProtocol";

import type { RemoteMediaGeometry } from "../remote/remoteMediaGeometry.js";
import {
  REMOTE_CURSOR_LOCAL_RENDERING_ENABLED,
  createDefaultRemoteCursorPresentation,
  createRemoteCursorPresentation,
  type RemoteCursorPresentation,
} from "../remote/remoteCursor.js";

interface CursorResource {
  generation: number;
  originalUrl?: string;
  resizedUrl?: string;
}

export function useRemoteCursorController(options: {
  stageRef: RefObject<HTMLDivElement | null>;
  geometryRef: RefObject<RemoteMediaGeometry | undefined>;
  active: boolean;
  primaryVideoId: string;
}) {
  const { stageRef, geometryRef, active, primaryVideoId } = options;
  const activeRef = useRef(active);
  const presentationRef = useRef<RemoteCursorPresentation>(createDefaultRemoteCursorPresentation());
  const resourceRef = useRef<CursorResource>({ generation: 0 });
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayModeRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const pointerTypeRef = useRef("mouse");
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | undefined>(undefined);
  const previousPrimaryVideoIdRef = useRef("");
  const supportsCursorImageRef = useRef(browserSupportsCursorImage());
  activeRef.current = active;

  const updateOverlayPosition = useCallback(() => {
    const overlay = overlayRef.current;
    const geometry = geometryRef.current;
    const point = lastPointerRef.current;
    if (!overlay || !geometry || !point || !overlayModeRef.current || !pointerInsideRef.current) return;
    const presentation = presentationRef.current;
    const left = point.clientX - geometry.containerRect.left - presentation.hotspotX;
    const top = point.clientY - geometry.containerRect.top - presentation.hotspotY;
    overlay.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, [geometryRef]);

  const applyCursor = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const currentOverlay = overlayRef.current?.isConnected ? overlayRef.current : null;
    const overlay = currentOverlay ?? stage.querySelector<HTMLDivElement>("[data-remote-cursor-overlay]");
    overlayRef.current = overlay;

    if (!activeRef.current) {
      stage.style.removeProperty("--remote-cursor");
      overlayModeRef.current = false;
      setOverlayVisible(overlay, false);
      return;
    }
    if (!REMOTE_CURSOR_LOCAL_RENDERING_ENABLED) {
      stage.style.setProperty("--remote-cursor", "none");
      overlayModeRef.current = false;
      setOverlayVisible(overlay, false);
      return;
    }

    const presentation = presentationRef.current;
    if (presentation.hidden) {
      stage.style.setProperty("--remote-cursor", "none");
      overlayModeRef.current = false;
      setOverlayVisible(overlay, false);
      return;
    }

    const resource = resourceRef.current;
    const cssImageUrl = resource.resizedUrl ?? resource.originalUrl;
    const touchPointer = pointerTypeRef.current !== "mouse";
    const overlayMode =
      touchPointer || presentation.forceOverlay || Boolean(cssImageUrl && !supportsCursorImageRef.current);
    overlayModeRef.current = overlayMode;
    if (!overlayMode) {
      const cursor = cssImageUrl
        ? `url(${JSON.stringify(cssImageUrl)}) ${presentation.hotspotX} ${presentation.hotspotY}, ${presentation.cssFallback}`
        : presentation.cssFallback;
      stage.style.setProperty("--remote-cursor", cursor);
      setOverlayVisible(overlay, false);
      return;
    }

    stage.style.setProperty("--remote-cursor", "none");
    if (overlay) {
      overlay.dataset.cursorKind = presentation.kind;
      overlay.dataset.hasImage = resource.originalUrl ? "true" : "false";
      overlay.style.width = `${presentation.renderWidth}px`;
      overlay.style.height = `${presentation.renderHeight}px`;
      overlay.style.backgroundImage = resource.originalUrl ? `url(${JSON.stringify(resource.originalUrl)})` : "none";
      setOverlayVisible(overlay, pointerInsideRef.current);
      updateOverlayPosition();
    }
  }, [stageRef, updateOverlayPosition]);

  const disposeResource = useCallback(() => {
    const resource = resourceRef.current;
    revokeObjectUrl(resource.resizedUrl);
    revokeObjectUrl(resource.originalUrl);
    resourceRef.current = { generation: resource.generation + 1 };
  }, []);

  const resetRemoteCursor = useCallback(() => {
    disposeResource();
    presentationRef.current = createDefaultRemoteCursorPresentation();
    applyCursor();
  }, [applyCursor, disposeResource]);

  const handleRemoteCursorShape = useCallback(
    (shape: DecodedStreamerCursorShape | null) => {
      if (!shape) {
        resetRemoteCursor();
        return;
      }

      const presentation = createRemoteCursorPresentation(shape);
      const previousResource = resourceRef.current;
      const generation = previousResource.generation + 1;
      const originalUrl = createCursorObjectUrl(presentation.imageBytes);
      resourceRef.current = { generation, originalUrl };
      presentationRef.current = presentation;
      applyCursor();
      revokeObjectUrl(previousResource.resizedUrl);
      revokeObjectUrl(previousResource.originalUrl);

      if (
        !originalUrl ||
        presentation.forceOverlay ||
        (presentation.imageWidth === presentation.renderWidth && presentation.imageHeight === presentation.renderHeight)
      ) {
        return;
      }

      void resizeCursorPng(presentation.imageBytes, presentation.renderWidth, presentation.renderHeight).then(
        (blob) => {
          if (!blob || resourceRef.current.generation !== generation) return;
          const resizedUrl = createObjectUrl(blob);
          if (!resizedUrl || resourceRef.current.generation !== generation) {
            revokeObjectUrl(resizedUrl);
            return;
          }
          revokeObjectUrl(resourceRef.current.resizedUrl);
          resourceRef.current = { ...resourceRef.current, resizedUrl };
          applyCursor();
        },
      );
    },
    [applyCursor, resetRemoteCursor],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    overlayRef.current = stage.querySelector<HTMLDivElement>("[data-remote-cursor-overlay]");

    const updatePointer = (event: PointerEvent) => {
      const nextPointerType = event.pointerType || "mouse";
      const modeChanged =
        pointerTypeRef.current !== nextPointerType || !pointerInsideRef.current || !overlayRef.current?.isConnected;
      pointerTypeRef.current = nextPointerType;
      pointerInsideRef.current = true;
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (modeChanged) applyCursor();
      updateOverlayPosition();
    };
    const leavePointer = () => {
      pointerInsideRef.current = false;
      setOverlayVisible(overlayRef.current, false);
    };

    stage.addEventListener("pointerenter", updatePointer);
    stage.addEventListener("pointermove", updatePointer);
    stage.addEventListener("pointerdown", updatePointer);
    stage.addEventListener("pointerleave", leavePointer);
    stage.addEventListener("pointercancel", leavePointer);
    applyCursor();
    return () => {
      stage.removeEventListener("pointerenter", updatePointer);
      stage.removeEventListener("pointermove", updatePointer);
      stage.removeEventListener("pointerdown", updatePointer);
      stage.removeEventListener("pointerleave", leavePointer);
      stage.removeEventListener("pointercancel", leavePointer);
      stage.style.removeProperty("--remote-cursor");
      setOverlayVisible(overlayRef.current, false);
      overlayRef.current = null;
    };
  }, [applyCursor, stageRef, updateOverlayPosition]);

  useEffect(() => {
    applyCursor();
  }, [active, applyCursor]);

  useEffect(() => {
    const previousId = previousPrimaryVideoIdRef.current;
    if (previousId && primaryVideoId && previousId !== primaryVideoId) resetRemoteCursor();
    if (primaryVideoId) previousPrimaryVideoIdRef.current = primaryVideoId;
  }, [primaryVideoId, resetRemoteCursor]);

  useEffect(() => disposeResource, [disposeResource]);

  return { handleRemoteCursorShape, resetRemoteCursor };
}

function setOverlayVisible(overlay: HTMLDivElement | null, visible: boolean): void {
  if (overlay) overlay.dataset.visible = visible ? "true" : "false";
}

function browserSupportsCursorImage(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  return CSS.supports("cursor", 'url("data:image/png;base64,iVBORw0KGgo=") 0 0, default');
}

function createCursorObjectUrl(bytes: Uint8Array | undefined): string | undefined {
  return bytes ? createObjectUrl(new Blob([copyCursorBytes(bytes)], { type: "image/png" })) : undefined;
}

function createObjectUrl(blob: Blob): string | undefined {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : undefined;
}

function revokeObjectUrl(url: string | undefined): void {
  if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

async function resizeCursorPng(
  bytes: Uint8Array | undefined,
  width: number,
  height: number,
): Promise<Blob | undefined> {
  if (!bytes || typeof createImageBitmap !== "function") return undefined;
  try {
    const bitmap = await createImageBitmap(new Blob([copyCursorBytes(bytes)], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      context.drawImage(bitmap, 0, 0, width, height);
      return await new Promise<Blob | undefined>((resolve) => {
        canvas.toBlob((blob) => resolve(blob ?? undefined), "image/png");
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}

function copyCursorBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
