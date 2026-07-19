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

import type { BusyAction, RemoteStageViewMode } from "../app/remoteControlTypes.js";
import { readLocalClipboardText } from "../browser/clipboard.js";
import type { BrowserRemoteSession, BrowserRemoteSessionState } from "../remote/browserRemoteSession.js";
import { sendRemoteShortcut, type RemoteShortcut } from "../remote/remoteShortcuts.js";
import { toRemoteKeyValue, toRemoteMouseButton } from "../remote/remoteControlUiModel.js";
import { clientPointToRemoteMedia } from "../remote/remoteMediaGeometry.js";
import { isDesktopRemoteScrollTarget, RemoteScrollDeltaAccumulator } from "../remote/remoteScrollInput.js";
import { useRemoteCursorController } from "./useRemoteCursorController.js";
import { useRemoteMediaGeometry } from "./useRemoteMediaGeometry.js";

const HOLD_MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

interface UseRemoteInputControllerOptions {
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  busy: BusyAction;
  controlChannelState: RTCDataChannelState;
  textChannelState: RTCDataChannelState;
  targetPlatform?: number;
  primaryRemoteVideoId: string;
  remoteStageViewMode: RemoteStageViewMode;
  run(action: BusyAction, task: () => Promise<void>): Promise<void>;
  onError(message: string): void;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
  showToast(message: string): void;
}

export function useRemoteInputController({
  browserSessionRef,
  busy,
  controlChannelState,
  textChannelState,
  targetPlatform,
  primaryRemoteVideoId,
  remoteStageViewMode,
  run,
  onError,
  onSessionStateChange,
  showToast,
}: UseRemoteInputControllerOptions) {
  const [clipboardText, setClipboardText] = useState("");
  const [clipboardStatus, setClipboardStatus] = useState("尚未读取本机剪贴板");
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
  const canReadLocalClipboard = busy === null;
  const canSendClipboardText = inputControlActive && textChannelState === "open" && clipboardText.trim().length > 0;
  const clipboardPreviewLabel = clipboardText.trim() ? `${clipboardText.length} 字符待发送` : "剪贴板内容未读取";
  const { geometryRef, refreshGeometry } = useRemoteMediaGeometry({
    stageRef: remoteStageRef,
    viewMode: remoteStageViewMode,
    primaryVideoId: primaryRemoteVideoId,
  });
  const { handleRemoteCursorShape, resetRemoteCursor } = useRemoteCursorController({
    stageRef: remoteStageRef,
    geometryRef,
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

  function handleRemoteClipboard(text: string): void {
    if (!text) return;
    setClipboardText(text);
    void writeRemoteClipboardToLocal(text);
  }

  async function writeRemoteClipboardToLocal(text: string): Promise<void> {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) {
      setClipboardStatus(`已收到远端剪贴板（${text.length} 字符），当前环境不支持写入本机剪贴板`);
      return;
    }
    try {
      await clipboard.writeText(text);
      setClipboardStatus(`已同步远端剪贴板到本机（${text.length} 字符）`);
    } catch {
      setClipboardStatus(`已收到远端剪贴板（${text.length} 字符），写入本机被拒绝，可在剪贴板面板手动处理`);
    }
  }

  async function handleReadLocalClipboard(): Promise<void> {
    await run("clipboard-read", async () => {
      try {
        const text = await readLocalClipboardText();
        if (typeof text !== "string") {
          setClipboardStatus("当前浏览器未返回剪贴板文本");
          return;
        }
        setClipboardText(text);
        setClipboardStatus(text.trim() ? `已读取 ${text.length} 字符` : "剪贴板为空");
      } catch (caught) {
        setClipboardStatus(
          `无法读取本机剪贴板（需在 HTTPS 或 localhost 下访问并授予剪贴板权限）：${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    });
  }

  function handleSendClipboardText(): void {
    const session = browserSessionRef.current;
    if (!clipboardText.trim() || !session) return;
    try {
      session.sendTextData(clipboardText);
      setClipboardStatus(`已发送 ${clipboardText.length} 字符到远端`);
      showToast("已发送剪贴板到远端");
      onSessionStateChange(session.getState());
    } catch (caught) {
      onError(errorMessage(caught));
    }
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
    try {
      flushPointerPosition(pointerPositionFromEvent(event));
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
    try {
      flushPointerPosition(pointerPositionFromEvent(event));
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
    try {
      flushPointerPosition(pointerPositionFromEvent(event));
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
    try {
      flushPointerPosition(pointerPositionFromEvent(event));
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
      session.sendTextData(text);
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  function flushPointerPosition(position: LocalPointerPosition): void {
    cancelPendingPointerMove();
    sendPointerPosition(position, true, true);
  }

  function sendPointerPosition(position: LocalPointerPosition, critical: boolean, refresh: boolean): void {
    const session = browserSessionRef.current;
    if (!inputControlActive || !session) return;
    const geometry = refresh ? refreshGeometry() : (geometryRef.current ?? refreshGeometry());
    if (!geometry) return;
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
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return {
    clipboardStatus,
    clipboardPreviewLabel,
    canReadLocalClipboard,
    canSendClipboardText,
    inputControlActive,
    isFullscreen,
    remoteStageRef,
    handleRemoteCursorShape,
    resetRemoteCursor,
    enableInputControl,
    resetInputControl,
    handleRemoteClipboard,
    handleReadLocalClipboard,
    handleSendClipboardText,
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
