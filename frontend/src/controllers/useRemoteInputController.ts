import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";

import type { RemoteStageViewMode } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { sendRemoteShortcut, type RemoteShortcut } from "../remote/remoteShortcuts.js";
import { toRemoteKeyValue, toRemoteMouseButton } from "../remote/remoteInputModel.js";
import { clientPointToRemoteMedia } from "../remote/remoteMediaGeometry.js";
import { isDesktopRemoteScrollTarget, RemoteScrollDeltaAccumulator } from "../remote/remoteScrollInput.js";
import { useRemoteCursorController } from "./useRemoteCursorController.js";
import { useRemoteMediaGeometry } from "./useRemoteMediaGeometry.js";

const HOLD_MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

interface UseRemoteInputControllerOptions {
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  controlChannelState: RTCDataChannelState;
  targetPlatform?: number;
  primaryRemoteVideoId: string;
  remoteStageViewMode: RemoteStageViewMode;
  onError(message: string): void;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
}

export function useRemoteInputController({
  browserSessionRef,
  controlChannelState,
  targetPlatform,
  primaryRemoteVideoId,
  remoteStageViewMode,
  onError,
  onSessionStateChange,
}: UseRemoteInputControllerOptions) {
  const [inputControlEnabled, setInputControlEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const remoteStageRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const controlChannelOpenedRef = useRef(false);
  const scrollDeltaAccumulatorRef = useRef(new RemoteScrollDeltaAccumulator());
  const pendingPointerMoveRef = useRef<LocalPointerPosition | undefined>(undefined);
  const pointerMoveFrameRef = useRef<number | undefined>(undefined);
  const cancelPendingPointerMove = useCallback((): void => {
    pendingPointerMoveRef.current = undefined;
    if (pointerMoveFrameRef.current === undefined) return;
    cancelPointerFrame(pointerMoveFrameRef.current);
    pointerMoveFrameRef.current = undefined;
  }, []);

  const inputControlActive = inputControlEnabled && controlChannelState === "open";
  const { geometryRef, refreshGeometry, subscribeGeometryChange } = useRemoteMediaGeometry({
    stageRef: remoteStageRef,
    viewMode: remoteStageViewMode,
    primaryVideoId: primaryRemoteVideoId,
  });
  const { handleRemoteCursorShape, resetRemoteCursor } = useRemoteCursorController({
    stageRef: remoteStageRef,
    geometryRef,
    subscribeGeometryChange,
    active: inputControlActive,
    primaryVideoId: primaryRemoteVideoId,
  });

  useEffect(() => {
    if (controlChannelState !== "open" && inputControlEnabled) {
      setInputControlEnabled(false);
    }
    if (controlChannelState !== "open") {
      scrollDeltaAccumulatorRef.current.reset();
      cancelPendingPointerMove();
    }
  }, [cancelPendingPointerMove, controlChannelState, inputControlEnabled]);

  useEffect(() => {
    scrollDeltaAccumulatorRef.current.reset();
  }, [targetPlatform]);

  useEffect(() => {
    if (controlChannelState !== "open") {
      controlChannelOpenedRef.current = false;
      return;
    }
    if (controlChannelOpenedRef.current) return;
    controlChannelOpenedRef.current = true;
    setInputControlEnabled(true);
    remoteStageRef.current?.focus();
  }, [controlChannelState]);

  useEffect(() => {
    const releaseHeldInputs = () => browserSessionRef.current?.releaseAllInputs();
    const onVisibilityChange = () => {
      if (document.hidden) releaseHeldInputs();
    };
    window.addEventListener("blur", releaseHeldInputs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", releaseHeldInputs);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [browserSessionRef]);

  useEffect(() => {
    const stage = remoteStageRef.current;
    if (!stage || !inputControlActive) return;
    const lockPageScroll = (event: Event) => event.preventDefault();
    stage.addEventListener("wheel", lockPageScroll, { passive: false });
    return () => stage.removeEventListener("wheel", lockPageScroll);
  }, [inputControlActive]);

  useEffect(() => cancelPendingPointerMove, [cancelPendingPointerMove]);

  function resetInputControl(): void {
    activePointerIdRef.current = null;
    scrollDeltaAccumulatorRef.current.reset();
    cancelPendingPointerMove();
    setInputControlEnabled(false);
  }

  function enableInputControl(): void {
    if (controlChannelState !== "open") return;
    setInputControlEnabled(true);
    remoteStageRef.current?.focus();
  }

  function handleRemoteShortcut(shortcut: RemoteShortcut): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    try {
      sendRemoteShortcut(session, shortcut);
      onSessionStateChange(session.getState());
      remoteStageRef.current?.focus();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleToggleInputControl(): void {
    if (inputControlActive) {
      resetInputControl();
      return;
    }
    enableInputControl();
  }

  function handleRemoteStagePointerDown(event: PointerEvent<HTMLDivElement>): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    event.preventDefault();
    event.currentTarget.focus();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (!flushPointerPosition(pointerPositionFromEvent(event))) {
      activePointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      return;
    }
    try {
      session.sendMouseButton({ action: "mousePress", button: toRemoteMouseButton(event.button) });
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleRemoteStagePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!inputControlActive || !browserSessionRef.current) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    pendingPointerMoveRef.current = pointerPositionFromEvent(event);
    if (pointerMoveFrameRef.current !== undefined) return;
    pointerMoveFrameRef.current = requestPointerFrame(() => {
      pointerMoveFrameRef.current = undefined;
      const latest = pendingPointerMoveRef.current;
      pendingPointerMoveRef.current = undefined;
      if (!latest) return;
      sendPointerPosition(latest, false, false);
    });
  }

  function handleRemoteStagePointerUp(event: PointerEvent<HTMLDivElement>): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    flushPointerPosition(pointerPositionFromEvent(event));
    try {
      session.sendMouseButton({ action: "mouseRelease", button: toRemoteMouseButton(event.button) });
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleRemoteStagePointerCancel(event: PointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    flushPointerPosition(pointerPositionFromEvent(event));
    try {
      session.sendMouseButton({ action: "mouseRelease", button: toRemoteMouseButton(event.button) });
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleRemoteStageWheel(event: WheelEvent<HTMLDivElement>): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    event.preventDefault();
    const desktopTarget = isDesktopRemoteScrollTarget(targetPlatform);
    const delta = scrollDeltaAccumulatorRef.current.push({
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      pageHeight: event.currentTarget.clientHeight,
      desktopTarget,
    });
    if (!delta) return;
    if (!flushPointerPosition(pointerPositionFromEvent(event))) return;
    try {
      session.sendMouseScroll(delta);
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleRemoteStageKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session || event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && (event.key === "v" || event.key === "V")) return;
    const isHoldModifier = HOLD_MODIFIER_KEYS.has(event.key);
    if (isHoldModifier && event.repeat) return;
    event.preventDefault();
    const value = toRemoteKeyValue(event);
    try {
      session.sendKeyboardInput({ action: "keyboardPress", value });
      if (!isHoldModifier) session.sendKeyboardInput({ action: "keyboardRelease", value });
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleRemoteStageKeyUp(event: KeyboardEvent<HTMLDivElement>): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    if ((event.ctrlKey || event.metaKey) && (event.key === "v" || event.key === "V")) return;
    if (!HOLD_MODIFIER_KEYS.has(event.key)) return;
    event.preventDefault();
    try {
      session.sendKeyboardInput({ action: "keyboardRelease", value: toRemoteKeyValue(event) });
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function handleRemoteStageBlur(): void {
    activePointerIdRef.current = null;
    scrollDeltaAccumulatorRef.current.reset();
    cancelPendingPointerMove();
    browserSessionRef.current?.releaseAllInputs();
  }

  function handleRemoteStagePaste(event: ClipboardEvent<HTMLDivElement>): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text) return;
    event.preventDefault();
    try {
      session.sendPastedText(text);
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function flushPointerPosition(position: LocalPointerPosition): boolean {
    cancelPendingPointerMove();
    return sendPointerPosition(position, true, true);
  }

  function sendPointerPosition(position: LocalPointerPosition, critical: boolean, refresh: boolean): boolean {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return false;
    const geometry = refresh ? refreshGeometry() : (geometryRef.current ?? refreshGeometry());
    if (!geometry) return false;
    const normalized = clientPointToRemoteMedia(geometry, { x: position.clientX, y: position.clientY });
    try {
      session.sendMouseMove(
        {
          absX: Math.round(normalized.x * geometry.mediaWidth),
          absY: Math.round(normalized.y * geometry.mediaHeight),
          surfaceWidth: geometry.mediaWidth,
          surfaceHeight: geometry.mediaHeight,
        },
        { critical },
      );
      return true;
    } catch (caught) {
      onError(errorMessage(caught));
      return false;
    }
  }

  return {
    inputControlActive,
    isFullscreen,
    remoteStageRef,
    handleRemoteCursorShape,
    resetRemoteCursor,
    enableInputControl,
    resetInputControl,
    handleRemoteShortcut,
    handleToggleFullscreen: () => setIsFullscreen((current) => !current),
    handleToggleInputControl,
    handleRemoteStagePointerDown,
    handleRemoteStagePointerMove,
    handleRemoteStagePointerUp,
    handleRemoteStagePointerCancel,
    handleRemoteStageWheel,
    handleRemoteStageKeyDown,
    handleRemoteStageKeyUp,
    handleRemoteStageBlur,
    handleRemoteStagePaste,
  };
}

interface LocalPointerPosition {
  clientX: number;
  clientY: number;
}

function pointerPositionFromEvent(event: { clientX: number; clientY: number }): LocalPointerPosition {
  return { clientX: event.clientX, clientY: event.clientY };
}

function requestPointerFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
  return window.setTimeout(() => callback(performance.now()), 16);
}

function cancelPointerFrame(frame: number): void {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frame);
  else window.clearTimeout(frame);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
