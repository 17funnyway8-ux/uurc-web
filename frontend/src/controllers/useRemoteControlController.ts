import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
  STREAMER_CLIENT_TYPES,
  STREAMER_CONTROL_CONNECT_TYPES,
  buildDefaultStreamerConnectOptionsBase64,
} from "@uurc/shared/streamer/connectOptions";
import { buildStreamerControlStreamerDataJson } from "@uurc/shared/streamer/controlConfig";
import { analyzeRemoteSignalReadiness } from "@uurc/shared/streamer/readiness";
import { STREAMER_DATA_CHANNEL_LABELS } from "@uurc/shared/streamer/transport";
import type { RemoteSignalGatewayStatus, RuntimeProfile } from "@uurc/shared/types";

import type { BusyAction, RemoteControlContext, RoomJoinContext } from "../app/remoteControlTypes.js";
import { SELF_DEVICE_BLOCKED_REASON } from "../app/remoteControlTypes.js";
import {
  cancelRemoteAssistance,
  clearRoomByDevice,
  getDeviceGroups,
  getRemoteBootstrap,
  getRuntimeProfile,
  getRemoteSignalDiagnostics,
  joinRoomByDevice,
  sendRemoteSignalControl,
  sendRemoteSignalSoac,
  startRemoteSignalGateway,
  stopRemoteSignalGateway,
} from "../api/client.js";
import type { RemoteControlPageProps } from "../components/RemoteControlPage.js";
import { formatParticipantMeta } from "../devices/deviceLabels.js";
import { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { REMOTE_CURSOR_LOCAL_RENDERING_ENABLED } from "../remote/remoteCursor.js";
import { remoteShortcutGroupTitleForPlatform } from "../remote/remoteShortcuts.js";
import {
  createAppControlId,
  createIdleBrowserRemoteState,
  formatAutoSwitchThresholds,
  formatAudioElement,
  formatBrowserRemoteStage,
  formatConnectionPath,
  formatDataChannelState,
  getRemoteConnectionQuality,
  formatInboundAudioStats,
  formatInboundVideoStats,
  formatRoomJoinContext,
  formatRoomReleaseDetail,
  formatRoomReleaseState,
  formatSignalGatewayErrorHint,
  formatSignalGatewayState,
  formatVideoElement,
  formatVideoFlow,
  getNextAction,
  getRoomJoinFailureMessage,
  getRoomJoinFailureTakeoverHint,
  summarizeRoomJoinUpstream,
  summarizeSwitchNetworkNotify,
  summarizeUnexpectedSignalEvents,
} from "../remote/remoteControlUiModel.js";
import { useRemoteAudioController } from "./useRemoteAudioController.js";
import { useRemoteVideoController } from "./useRemoteVideoController.js";
import { useRemoteControlPreferences } from "./useRemoteControlPreferences.js";
import { useRemoteClipboardController } from "./useRemoteClipboardController.js";
import { useRemoteInputController } from "./useRemoteInputController.js";
import { useRoomController } from "./useRoomController.js";
import { useSignalGatewayController } from "./useSignalGatewayController.js";
import { useToastController } from "./useToastController.js";

// 把底层/协议级英文错误映射成用户能看懂、带“怎么办”的中文；未知错误原样返回。
function toFriendlyError(message: string): string {
  const text = message || "";
  if (/Unexpected token|not valid JSON|Unexpected end of JSON|JSON at position/i.test(text))
    return "账号凭证 JSON 格式不正确，请检查是否完整复制。";
  if (/Join a room before starting remote control|请先加入房间/i.test(text)) return "请先加入设备房间再开始远控。";
  if (/ack timed out|timed out|timeout/i.test(text)) return "连接超时，请稍后重试。";
  if (/signal control ack failed/i.test(text)) return "对端拒绝了本次连接，请稍后重试或更换网络。";
  if (/did not include a ControlResult/i.test(text)) return "未收到对端的连接许可，请重试。";
  if (/socket is not connected|is not connected|not open/i.test(text)) return "连接服务未就绪，请重新连接。";
  if (/Failed to fetch|NetworkError|ERR_NETWORK|network error/i.test(text)) return "网络异常，请检查网络后重试。";
  if (/Missing required login state/i.test(text)) return "账号凭证不完整，请重新登录。";
  return text;
}

export function useRemoteControlController(context: RemoteControlContext) {
  const { authStatus, devices, devicesLoaded, handoff, onControlLeave, onDevicesChange } = context;
  const {
    roomResponse,
    setRoomResponse,
    roomJoinContext,
    setRoomJoinContext,
    remoteBootstrap,
    setRemoteBootstrap,
  } = useRoomController(handoff);
  const [forceJoin, setForceJoin] = useState(handoff?.roomJoinContext.forceJoin ?? false);
  const [runtimeProfile, setRuntimeProfile] = useState<RuntimeProfile | null>(null);
  const [browserRemoteState, setBrowserRemoteState] = useState<BrowserRemoteSessionState>(createIdleBrowserRemoteState);
  const [autoReconnectAttemptCount, setAutoReconnectAttemptCount] = useState(0);
  const [decodeStalledStreak, setDecodeStalledStreak] = useState(0);
  const [autoReconnectStatus, setAutoReconnectStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const { toast, showToast, dismissToast } = useToastController();
  const browserRemoteSession = useRef<BrowserRemoteSession | null>(null);
  const remoteStageFrameRef = useRef<HTMLDivElement | null>(null);
  const autoConnectAttemptedDeviceRef = useRef<string>("");
  const {
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
  } = useRemoteControlPreferences(remoteBootstrap?.signalServers.length ?? 0);
  const {
    signalGatewayContext,
    setSignalGatewayContext,
    signalGatewayStatus,
    setSignalGatewayStatus,
    signalEvents,
    remoteSignalDiagnostics,
    setRemoteSignalDiagnostics,
    resetSignalEvents,
    resetSignalGateway,
    refreshSignalEvents,
  } = useSignalGatewayController({
    browserStage: browserRemoteState.stage,
    browserSessionRef: browserRemoteSession,
    onPollingError: setError,
    onSessionStateChange: setBrowserRemoteState,
  });
  const {
    remoteVideoStreams,
    remoteVideoCount,
    remoteVideoSources,
    primaryRemoteVideoId,
    primaryRemoteVideoActive,
    setSelectedRemoteVideoId,
    handleRemoteMediaStream,
    handleRemoteVideoSample,
    resetRemoteVideos,
  } = useRemoteVideoController({
    browserSessionRef: browserRemoteSession,
    onSessionStateChange: setBrowserRemoteState,
  });
  const { remoteAudio, handleRemoteAudioStream, resetRemoteAudio } = useRemoteAudioController({
    browserSessionRef: browserRemoteSession,
    onSessionStateChange: setBrowserRemoteState,
  });
  const handleRemoteStream = useCallback(
    (stream: MediaStream) => {
      handleRemoteMediaStream(stream);
      handleRemoteAudioStream(stream);
    },
    [handleRemoteAudioStream, handleRemoteMediaStream],
  );
  const navigate = useNavigate();
  const { deviceId: routeSelectedDeviceId = "" } = useParams<{ deviceId: string }>();

  const allDevices = useMemo(
    () => [...devices.desktopDevices, ...devices.mobileDevices, ...devices.tvDevices],
    [devices.desktopDevices, devices.mobileDevices, devices.tvDevices],
  );
  const selectedDeviceId = routeSelectedDeviceId;

  const selectedDevice = useMemo(
    () => allDevices.find((device) => device.deviceId === selectedDeviceId) ?? null,
    [allDevices, selectedDeviceId],
  );
  const localSignalReadiness = useMemo(
    () =>
      analyzeRemoteSignalReadiness({
        events: signalEvents,
        signalStatus: signalGatewayStatus,
      }),
    [signalEvents, signalGatewayStatus],
  );
  const signalReadiness = remoteSignalDiagnostics ?? localSignalReadiness;
  const selectedParticipants = selectedDevice?.participantsInfo ?? [];
  const selectedDeviceOccupied = selectedParticipants.length > 0;
  // 用 participant.clientId 与当前网页控制端的 clientId 比对，区分“占用者是不是自己上一个会话”。
  // 仅当占用者全部是自己时才自动接管；任一占用者是他人则保留显式接管步骤（避免误踢真实控制端）。
  const currentClientId = authStatus?.clientId ?? "";
  const occupiedBySelfClient =
    selectedParticipants.length > 0 &&
    currentClientId.length > 0 &&
    selectedParticipants.every((participant) => participant.clientId === currentClientId);
  const occupiedByOthers = selectedParticipants.some(
    (participant) => !participant.clientId || participant.clientId !== currentClientId,
  );
  const occupyingParticipant =
    selectedParticipants.find((participant) => !participant.clientId || participant.clientId !== currentClientId) ??
    selectedParticipants[0] ??
    null;
  const occupyingParticipantLabel = occupyingParticipant
    ? occupyingParticipant.alias
      ? `${occupyingParticipant.alias}（${formatParticipantMeta(occupyingParticipant)}）`
      : formatParticipantMeta(occupyingParticipant) || "其他控制端"
    : "其他控制端";
  const textChannelState = browserRemoteState.dataChannels[STREAMER_DATA_CHANNEL_LABELS.text] ?? "closed";
  const fileChannelState = browserRemoteState.dataChannels[STREAMER_DATA_CHANNEL_LABELS.file] ?? "closed";
  const controlChannelState = browserRemoteState.dataChannels[STREAMER_DATA_CHANNEL_LABELS.control] ?? "closed";
  const remoteClipboardReadEnabled =
    (roomJoinContext?.kind === "remote_assistance" ? roomJoinContext.targetPlatform : selectedDevice?.platform) ===
    STREAMER_CLIENT_TYPES.Client_MAC;
  const {
    clipboardSyncEnabled,
    clipboardSyncAvailable,
    localClipboardStatusLabel,
    remoteClipboardStatusLabel,
    remoteClipboardPendingText,
    canReadLocalClipboard,
    canSendClipboardText,
    canCopyRemoteClipboard,
    resetClipboardSession,
    handleClipboardSyncEnabledChange,
    handleRemoteClipboard,
    handleReadLocalClipboard,
    handleSendClipboardText,
    handleCopyRemoteClipboard,
  } = useRemoteClipboardController({
    browserSessionRef: browserRemoteSession,
    sessionKey: selectedDeviceId,
    fileChannelState,
    remoteClipboardReadEnabled,
    textChannelState,
    onError: setError,
    onSessionStateChange: setBrowserRemoteState,
    showToast,
  });
  const {
    inputControlActive,
    isFullscreen,
    remoteStageRef,
    handleRemoteCursorShape,
    resetRemoteCursor,
    enableInputControl,
    resetInputControl,
    handleRemoteShortcut,
    handleToggleFullscreen,
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
  } = useRemoteInputController({
    browserSessionRef: browserRemoteSession,
    controlChannelState,
    targetPlatform: resolveTargetPlatform(),
    primaryRemoteVideoId,
    remoteStageViewMode,
    onError: setError,
    onSessionStateChange: setBrowserRemoteState,
  });
  useEffect(() => {
    let active = true;
    void getRuntimeProfile()
      .then((runtime) => {
        if (active) setRuntimeProfile(runtime);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      browserRemoteSession.current?.close();
      browserRemoteSession.current = null;
    },
    [],
  );

  async function run(action: BusyAction, task: () => Promise<void>) {
    setBusy(action);
    setError("");
    try {
      await task();
    } catch (caught) {
      setError(toFriendlyError(caught instanceof Error ? caught.message : String(caught)));
    } finally {
      setBusy(null);
    }
  }

  async function loadDevices() {
    await run("devices", async () => {
      onDevicesChange(await getDeviceGroups());
    });
  }

  async function joinRoomForDevice(deviceId: string, joinWithForce = forceJoin): Promise<RoomJoinContext | null> {
    if (!deviceId) return null;
    let nextContext: RoomJoinContext | null = null;
    await run("join", async () => {
      if (deviceId === authStatus?.deviceId) {
        throw new Error(SELF_DEVICE_BLOCKED_REASON);
      }
      const device = allDevices.find((item) => item.deviceId === deviceId) ?? null;
      const context = {
        kind: "owned_device" as const,
        deviceId,
        forceJoin: joinWithForce,
        occupiedAtJoin: (device?.participantsInfo?.length ?? 0) > 0,
      };
      const joined = await joinRoomByDevice(deviceId, joinWithForce);
      setRoomResponse(joined);
      setRoomJoinContext(context);
      setForceJoin(joinWithForce);
      resetSignalGateway();
      resetBrowserRemoteSession();
      setRemoteBootstrap(joined.roomConfigSummary ? await getRemoteBootstrap() : null);
      // 房间加入失败（无房间配置）时不返回上下文：让 handleNextAction 就此停下，
      // 由 roomJoinFailureMessage 展示友好中文提示，避免后续信令启动抛出英文异常。
      if (joined.roomConfigSummary) nextContext = context;
    });
    return nextContext;
  }

  async function handleStartSignalGateway(context = roomJoinContext): Promise<RemoteSignalGatewayStatus | null> {
    let nextStatus: RemoteSignalGatewayStatus | null = null;
    await run("signal-start", async () => {
      if (!context || context.deviceId !== selectedDeviceId) {
        throw new Error("请先加入房间");
      }
      resetSignalEvents();
      const status = await startRemoteSignalGateway({
        gzipSdp: sdpTransportMode === "gzip",
        signalServerIndex: signalServerIndex > 0 ? signalServerIndex : undefined,
      });
      nextStatus = status;
      setSignalGatewayStatus(status);
      setSignalGatewayContext(status.status === "connected" ? context : null);
      setRemoteSignalDiagnostics(await getRemoteSignalDiagnostics());
    });
    return nextStatus;
  }

  async function handleStopSignalGateway() {
    await run("signal-stop", async () => {
      resetBrowserRemoteSession();
      const stopped = await stopRemoteSignalGateway();
      let nextStatus = stopped;
      const clearContext = roomJoinContext;
      if (clearContext?.deviceId) {
        try {
          nextStatus = {
            ...stopped,
            roomClear:
              clearContext.kind === "remote_assistance"
                ? await cancelRemoteAssistance(clearContext.connectId ?? clearContext.deviceId)
                : await clearRoomByDevice(clearContext.deviceId),
            updatedAt: new Date().toISOString(),
          };
        } catch (caught) {
          nextStatus = {
            ...stopped,
            roomClearError: caught instanceof Error ? caught.message : String(caught),
            updatedAt: new Date().toISOString(),
          };
        }
      }
      setSignalGatewayStatus(nextStatus);
      setSignalGatewayContext(null);
      resetSignalEvents();
      showToast("已断开远控连接");
      if (
        nextStatus.roomClear &&
        (nextStatus.roomClear.body.code === undefined || nextStatus.roomClear.body.code === 0)
      ) {
        setRoomJoinContext((current) => (current ? { ...current, occupiedAtJoin: false } : current));
      }
      if (clearContext?.kind !== "remote_assistance") {
        try {
          onDevicesChange(await getDeviceGroups());
        } catch {
          // Disconnect should still complete even if the follow-up device refresh fails.
        }
      }
    });
  }

  async function handleReturnToDevices() {
    if (busy !== null) return;
    // 仅在确有可断开的活动连接时才二次确认；已手动断开（canDisconnectRemote 为 false）后直接返回，
    // 不再因残留的 roomJoinContext 误弹“将断开远控”确认框。
    const hasActiveSession = canDisconnectRemote;
    if (hasActiveSession) {
      const message =
        roomJoinContext?.kind === "remote_assistance"
          ? "返回将断开当前远控并取消本次远程协助，确定返回？"
          : "返回将断开当前远控并释放 UU 房间占用，确定返回？";
      if (typeof window !== "undefined" && !window.confirm(message)) return;
      await handleStopSignalGateway();
    }
    onControlLeave();
    navigate("/devices");
  }

  function resetBrowserRemoteSession() {
    const closedState = browserRemoteSession.current?.close();
    browserRemoteSession.current = null;
    resetClipboardSession();
    resetRemoteCursor();
    resetInputControl();
    resetRemoteVideos();
    resetRemoteAudio();
    setBrowserRemoteState(closedState ?? createIdleBrowserRemoteState());
  }

  async function startBrowserRemoteSession(options: { skipReadinessCheck?: boolean; forceRelay?: boolean } = {}) {
    if (browserWebRtcUnavailableReason) throw new Error(browserWebRtcUnavailableReason);
    if (!authStatus?.deviceId) throw new Error("登录已失效");
    if (!selectedDeviceId) throw new Error("请选择设备");
    if (!options.skipReadinessCheck && !roomReadyForBrowserRtc) throw new Error(browserRtcBlockedReason);
    resetInputControl();
    resetClipboardSession();
    const appControlId = createAppControlId();
    const session = new BrowserRemoteSession({
      api: {
        sendSignalControl: sendRemoteSignalControl,
        sendSignalSoac: sendRemoteSignalSoac,
      },
      onRemoteStream: handleRemoteStream,
      onRemoteClipboard: handleRemoteClipboard,
      onRemoteCursorShape: handleRemoteCursorShape,
      onStateChange: setBrowserRemoteState,
    });
    browserRemoteSession.current = session;
    const controlConnectType =
      roomJoinContext?.kind === "remote_assistance"
        ? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Assistance
        : STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal;
    const targetPlatform = resolveTargetPlatform();
    const state = await session.start({
      appControlId,
      appDataBase64: buildDefaultStreamerConnectOptionsBase64({
        deviceId: authStatus.deviceId,
        clientType:
          targetPlatform === STREAMER_CLIENT_TYPES.Client_MAC
            ? STREAMER_CLIENT_TYPES.Client_MAC
            : STREAMER_CLIENT_TYPES.Client_ANDROID,
        controlConnectType,
        cursorCapture: !REMOTE_CURSOR_LOCAL_RENDERING_ENABLED,
      }),
      streamerData: buildStreamerControlStreamerDataJson({ controlId: appControlId }),
      forceRelay: options.forceRelay ?? (connectionRouteMode === "relay" ? true : undefined),
      gzipSdp: sdpTransportMode === "gzip",
      targetPlatform,
    });
    setBrowserRemoteState(state);
    await refreshSignalEvents(session);
  }

  async function handleStartBrowserRemote(options: { skipReadinessCheck?: boolean } = {}) {
    await run("browser-remote-start", async () => {
      await startBrowserRemoteSession(options);
    });
  }

  async function handleReconnectRemote() {
    await run("reconnect", async () => {
      resetBrowserRemoteSession();
      // 自动切换方案：默认“自动路径”多次重连仍失败时，升级为强制 UU 中转以提升成功率。
      const escalateRelay = connectionRouteMode === "auto" && autoReconnectAttemptCount >= 2;
      if (!signalGatewayMatchesRoom) {
        resetSignalEvents();
        const status = await startRemoteSignalGateway({
          gzipSdp: sdpTransportMode === "gzip",
          signalServerIndex: signalServerIndex > 0 ? signalServerIndex : undefined,
        });
        setSignalGatewayStatus(status);
        setSignalGatewayContext(status.status === "connected" ? roomJoinContext : null);
        setRemoteSignalDiagnostics(await getRemoteSignalDiagnostics());
        if (status.status !== "connected") {
          throw new Error(formatSignalGatewayErrorHint(status) || "连接服务未启动");
        }
      }
      await startBrowserRemoteSession({ skipReadinessCheck: true, forceRelay: escalateRelay ? true : undefined });
    });
  }

  async function handleNextAction() {
    if (busy !== null) return;
    if (!loggedIn) {
      setError("请先登录");
      return;
    }
    if (!selectedDeviceId || (deviceTotal === 0 && roomJoinContext?.kind !== "remote_assistance")) {
      await loadDevices();
      return;
    }
    if (browserWebRtcUnavailableReason) {
      setError(browserWebRtcUnavailableReason);
      return;
    }
    if (!roomJoinedForSelectedDevice || roomRequiresTakeover || signalGatewayState === "error") {
      // 自己上一个会话占用时直接接管（force），无需用户再点一次；他人占用仍保留显式两步。
      const joinWithForce = roomRequiresTakeover || occupiedBySelfClient ? true : forceJoin;
      const nextContext = await joinRoomForDevice(selectedDeviceId, joinWithForce);
      if (!nextContext || (nextContext.occupiedAtJoin && !nextContext.forceJoin)) return;
      const status = await handleStartSignalGateway(nextContext);
      if (status?.status === "connected") {
        await handleStartBrowserRemote({ skipReadinessCheck: true });
      }
      return;
    }
    if (!signalGatewayMatchesRoom) {
      const status = await handleStartSignalGateway();
      if (status?.status === "connected") {
        await handleStartBrowserRemote({ skipReadinessCheck: true });
      }
      return;
    }
    if (browserRemoteState.stage === "idle") {
      await handleStartBrowserRemote();
      return;
    }
    if (browserConnectionRecoverable) {
      await handleReconnectRemote();
      return;
    }
    if (!inputControlActive && controlChannelState === "open") {
      enableInputControl();
      return;
    }
  }

  function resolveTargetPlatform(): number | undefined {
    return roomJoinContext?.kind === "remote_assistance" ? roomJoinContext.targetPlatform : selectedDevice?.platform;
  }

  const loggedIn = Boolean(authStatus?.hasState);
  const deviceTotal = devices.desktopDevices.length + devices.mobileDevices.length + devices.tvDevices.length;
  const roomDebugPayload = roomResponse
    ? {
        upstream: summarizeRoomJoinUpstream(roomResponse.upstream),
        roomConfigSummary: roomResponse.roomConfigSummary,
        sessionReference: roomResponse.sessionReference,
        remoteBootstrap,
        signalGatewayStatus,
        remoteSignalDiagnostics,
        roomJoinContext,
        signalGatewayContext,
      }
    : null;
  const signalGatewayState = signalGatewayStatus?.status ?? "idle";
  const activeSignalHeaders = signalGatewayStatus?.signalHeaders ?? remoteBootstrap?.signalHeaders;
  const signalHeaderSummary = activeSignalHeaders
    ? Object.entries(activeSignalHeaders)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")
    : "-";
  const roomJoinFailureMessage = getRoomJoinFailureMessage(roomResponse);
  const roomJoinFailureTakeoverHint = getRoomJoinFailureTakeoverHint(roomResponse, forceJoin);
  const selectedDeviceIsCurrentAuthDevice = Boolean(
    authStatus?.deviceId && selectedDeviceId && selectedDeviceId === authStatus.deviceId,
  );
  const selfDeviceBlockedReason = selectedDeviceIsCurrentAuthDevice ? SELF_DEVICE_BLOCKED_REASON : "";
  const roomJoinedForSelectedDevice =
    roomJoinContext?.deviceId === selectedDeviceId && Boolean(roomResponse?.roomConfigSummary);
  const roomRequiresTakeover =
    roomJoinedForSelectedDevice && roomJoinContext?.occupiedAtJoin === true && !roomJoinContext.forceJoin;
  const signalGatewayMatchesRoom =
    signalGatewayState === "connected" &&
    signalGatewayContext?.deviceId === roomJoinContext?.deviceId &&
    signalGatewayContext?.forceJoin === roomJoinContext?.forceJoin &&
    (signalGatewayContext?.kind ?? "owned_device") === (roomJoinContext?.kind ?? "owned_device");
  const roomReadyForBrowserRtc = roomJoinedForSelectedDevice && !roomRequiresTakeover && signalGatewayMatchesRoom;
  const browserRtcBlockedReason = selfDeviceBlockedReason
    ? selfDeviceBlockedReason
    : roomJoinFailureMessage
      ? roomJoinFailureMessage
      : !roomJoinedForSelectedDevice
        ? "请先加入房间"
        : roomRequiresTakeover
          ? "选择接管后重试"
          : !signalGatewayMatchesRoom
            ? "重新连接"
            : "";
  const normalJoinLeftBeforeAnswer =
    roomJoinContext?.forceJoin === false &&
    signalReadiness.blocker === "controlled_left_before_answer" &&
    signalReadiness.checks.offerSent &&
    !signalReadiness.checks.answerReceived;
  const normalJoinTakeoverHint = normalJoinLeftBeforeAnswer ? "画面未返回。" : "";
  const browserRtcReady = roomReadyForBrowserRtc && busy === null && !browserWebRtcUnavailableReason;
  const browserIceServers = browserRemoteState.controlResult?.iceServers.length ?? 0;
  const connectionPathLabel = formatConnectionPath(browserRemoteState.connectionPath);
  const inboundAudioStatsLabel = formatInboundAudioStats(browserRemoteState.inboundAudio);
  const inboundVideoStatsLabel = formatInboundVideoStats(browserRemoteState.inboundVideo);
  const audioPlaybackLabel = formatAudioElement(browserRemoteState.audioElement);
  const videoFlowLabel = formatVideoFlow(browserRemoteState);
  const videoElementLabel = formatVideoElement(browserRemoteState.videoElement);
  const controlChannelLabel = formatDataChannelState(controlChannelState);
  const textChannelLabel = formatDataChannelState(textChannelState);
  const inputControlLabel = inputControlActive
    ? "控制中"
    : controlChannelState === "open"
      ? "仅查看"
      : controlChannelLabel;
  const decodeStalledPersisted = browserRemoteState.videoFlow?.status === "decode_stalled" && decodeStalledStreak >= 2;
  const browserConnectionRecoverable =
    browserRemoteState.stage === "connected" &&
    (controlChannelState === "closed" ||
      browserRemoteState.videoFlow?.status === "transport_stalled" ||
      decodeStalledPersisted);
  const remoteRecoveryLabel = browserConnectionRecoverable
    ? controlChannelState === "closed"
      ? "控制连接已断开"
      : decodeStalledPersisted
        ? "画面卡顿（解码异常）"
        : "画面中断（网络）"
    : "";
  const autoReconnectLabel =
    browserConnectionRecoverable && autoReconnectEnabled
      ? autoReconnectStatus || "自动重连准备中"
      : autoReconnectEnabled
        ? "自动重连已开启"
        : "自动重连已关闭";
  const connectionQuality = getRemoteConnectionQuality({
    state: browserRemoteState,
    controlChannelState,
    inputControlActive,
    textChannelState,
    connectionPathLabel,
  });

  useEffect(() => {
    // 累计连续“解码停滞”采样数：要求持续 ≥2 次才触发自动恢复，避免偶发解码抖动误重连。
    setDecodeStalledStreak((streak) => (browserRemoteState.videoFlow?.status === "decode_stalled" ? streak + 1 : 0));
  }, [browserRemoteState.videoFlow]);

  useEffect(() => {
    if (!browserConnectionRecoverable) {
      if (autoReconnectAttemptCount !== 0) setAutoReconnectAttemptCount(0);
      if (autoReconnectStatus) setAutoReconnectStatus("");
      return;
    }
    if (!autoReconnectEnabled || busy !== null || !roomJoinedForSelectedDevice || !signalGatewayMatchesRoom) return;

    const delayMs = Math.min(5000, 900 * 2 ** Math.min(autoReconnectAttemptCount, 3));
    setAutoReconnectStatus(`自动重连将在 ${Math.ceil(delayMs / 1000)} 秒后尝试`);
    const timer = window.setTimeout(() => {
      setAutoReconnectAttemptCount((count) => count + 1);
      void handleReconnectRemote();
    }, delayMs);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleReconnectRemote 每次渲染重建，纳入依赖会导致退避定时器被反复重置
  }, [
    autoReconnectAttemptCount,
    autoReconnectEnabled,
    autoReconnectStatus,
    browserConnectionRecoverable,
    busy,
    roomJoinedForSelectedDevice,
    signalGatewayMatchesRoom,
  ]);
  const selectedCandidatePair = browserRemoteState.selectedCandidatePair;
  const candidatePairSummary = selectedCandidatePair
    ? `${selectedCandidatePair.localCandidateType ?? "-"} -> ${selectedCandidatePair.remoteCandidateType ?? "-"}`
    : "-";
  const networkSwitchSummary = summarizeSwitchNetworkNotify(signalEvents);
  const unexpectedSignalEventSummary = summarizeUnexpectedSignalEvents(
    signalEvents,
    remoteBootstrap?.signalEvents ?? [],
  );
  const signalServerOptions = remoteBootstrap?.signalServers ?? [];
  const signalGatewayErrorHint = formatSignalGatewayErrorHint(signalGatewayStatus);
  const autoSwitchThresholdLabel = formatAutoSwitchThresholds(browserRemoteState.controlResult);
  const sdpTransportLabel = sdpTransportMode === "gzip" ? "gzip_sdp" : "plain_sdp";
  const connectionRouteLabel = connectionRouteMode === "relay" ? "强制中转" : "自动路径";
  const effectiveConnectionRouteLabel =
    connectionRouteMode === "relay"
      ? "强制中转"
      : browserRemoteState.controlResult?.forceRelay
        ? "服务端要求中转"
        : connectionRouteLabel;
  const serviceRoutePolicyLabel = browserRemoteState.controlResult?.forceRelay
    ? "服务端要求中转"
    : browserRemoteState.controlResult?.autoSwitchNetwork
      ? "服务端自动切换"
      : "-";
  const iceControlStatusLabel = browserRemoteState.controlResultIceId
    ? browserRemoteState.controlIceIdMatch === undefined
      ? "使用 ack ICE"
      : browserRemoteState.controlIceIdMatch
        ? "ack ICE 已对齐"
        : "ack ICE 覆盖本地候选"
    : browserRemoteState.iceId
      ? "ICE 等待 ack"
      : "-";
  const signalGatewayDisplay = formatSignalGatewayState(signalGatewayState);
  const browserStageLabel = formatBrowserRemoteStage(browserRemoteState.stage);
  const browserRtcDescription = browserRemoteState.controlResult ? "连接许可已确认" : "等待连接确认";
  const joinModeLabel = forceJoin ? "接管控制" : "普通加入";
  const roomJoinModeDebugLabel = formatRoomJoinContext(remoteBootstrap?.joinContext);
  const selectedTargetLabel =
    roomJoinContext?.kind === "remote_assistance"
      ? (roomJoinContext.deviceName ?? `远程协助 ${roomJoinContext.connectId ?? roomJoinContext.deviceId}`)
      : (selectedDevice?.alias ?? "远控画面");
  const debugEvents = browserRemoteState.debugEvents;
  const hasRemoteVideo = remoteVideoCount > 0;
  const canDisconnectRemote =
    signalGatewayState === "connected" ||
    browserRemoteState.stage !== "idle" ||
    remoteVideoCount > 0 ||
    controlChannelState !== "closed" ||
    textChannelState !== "closed";
  const roomReleaseLabel = formatRoomReleaseState(
    signalGatewayStatus,
    canDisconnectRemote,
    selectedDeviceOccupied,
    roomJoinContext,
  );
  const roomReleaseDetail = formatRoomReleaseDetail(signalGatewayStatus, roomJoinContext);
  const nextAction = getNextAction({
    busy,
    browserConnectionRecoverable,
    controlChannelState,
    deviceTotal,
    inputControlActive,
    loggedIn,
    roomJoinedForSelectedDevice,
    remoteAssistanceTarget: roomJoinContext?.kind === "remote_assistance",
    roomRequiresTakeover,
    selectedDeviceId,
    selectedDeviceIsCurrentAuthDevice,
    signalGatewayErrored: signalGatewayState === "error",
    signalGatewayMatchesRoom,
    browserStage: browserRemoteState.stage,
    forceJoin,
  });

  const remoteAssistanceActive = roomJoinContext?.kind === "remote_assistance";
  useEffect(() => {
    if (
      !autoConnect ||
      !loggedIn ||
      !selectedDeviceId ||
      selectedDeviceIsCurrentAuthDevice ||
      occupiedByOthers ||
      busy !== null ||
      browserRemoteState.stage !== "idle" ||
      signalGatewayState === "connected" ||
      autoConnectAttemptedDeviceRef.current === selectedDeviceId ||
      // 自有设备需等设备列表加载完、且确实能定位到该设备，才知道占用情况并决定是否接管；
      // 远程协助的目标不在设备列表内，走各自的加入流程，不受此限制。
      (!remoteAssistanceActive && (!devicesLoaded || !selectedDevice))
    ) {
      return;
    }
    // 进入设备控制页后自动发起一次连接：他人占用已被 occupiedByOthers 排除；
    // 若仅被自己上一个会话占用，handleNextAction 会自动接管（force join）。
    autoConnectAttemptedDeviceRef.current = selectedDeviceId;
    void handleNextAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleNextAction 每次渲染重建，不入依赖；用 ref 保证每台设备只自动连一次
  }, [
    autoConnect,
    loggedIn,
    selectedDeviceId,
    selectedDeviceIsCurrentAuthDevice,
    occupiedByOthers,
    devicesLoaded,
    selectedDevice,
    remoteAssistanceActive,
    busy,
    browserRemoteState.stage,
    signalGatewayState,
  ]);

  const remoteShortcutPlatform = remoteShortcutGroupTitleForPlatform(resolveTargetPlatform());
  const deviceNotFound =
    loggedIn && devicesLoaded && Boolean(selectedDeviceId) && !selectedDevice && !remoteAssistanceActive;
  // 画面区中央的状态文案：与顶栏状态对齐，避免出现“未连接/已就绪/等待连接”多套说法互相矛盾。
  const stageStatusLabel =
    browserRemoteState.stage === "connected"
      ? "已连接"
      : browserRemoteState.remoteTrackCount > 0
        ? "正在加载画面…"
        : signalGatewayState === "connected" || busy === "signal-start" || busy === "browser-remote-start"
          ? "连接中…"
          : occupiedByOthers && !forceJoin
            ? "设备被占用，点「接管并开始连接」"
            : roomResponse || remoteBootstrap
              ? "已就绪，点「开始连接」"
              : "未连接";

  const controlPageProps: RemoteControlPageProps = {
    shell: {
      deviceNotFound,
      error,
      isFullscreen,
      onReturnToDevices: () => void handleReturnToDevices(),
      remoteStageFrameRef,
    },
    topbar: {
      browserRemoteState,
      busy,
      canDisconnectRemote,
      onReturnToDevices: () => void handleReturnToDevices(),
      onStopSignalGateway: () => void handleStopSignalGateway(),
      selectedDevice,
      selectedTargetLabel,
      signalGatewayDisplay,
    },
    commandBar: {
      busy,
      controlChannelState,
      inputControlActive,
      isFullscreen,
      nextAction,
      onNextAction: () => void handleNextAction(),
      onRemoteShortcut: handleRemoteShortcut,
      onStageViewModeChange: setRemoteStageViewMode,
      onToggleInputControl: handleToggleInputControl,
      onToggleFullscreen: handleToggleFullscreen,
      remoteAudio,
      remoteShortcutPlatform,
      remoteStageViewMode,
    },
    reconnect: {
      autoReconnectAttemptCount,
      busy,
      canReconnectRemote: browserConnectionRecoverable,
      onReconnectRemote: () => void handleReconnectRemote(),
      remoteRecoveryLabel,
    },
    stage: {
      browserRemoteState,
      browserStageLabel,
      hasRemoteVideo,
      inputControlActive,
      inputControlLabel,
      onRemoteStageKeyDown: handleRemoteStageKeyDown,
      onRemoteStageKeyUp: handleRemoteStageKeyUp,
      onRemoteStageBlur: handleRemoteStageBlur,
      onRemoteStagePaste: handleRemoteStagePaste,
      onRemoteStagePointerCancel: handleRemoteStagePointerCancel,
      onRemoteStagePointerDown: handleRemoteStagePointerDown,
      onRemoteStagePointerMove: handleRemoteStagePointerMove,
      onRemoteStagePointerUp: handleRemoteStagePointerUp,
      onRemoteStageWheel: handleRemoteStageWheel,
      onRemoteVideoSample: handleRemoteVideoSample,
      primaryRemoteVideoActive,
      primaryRemoteVideoId,
      remoteStageRef,
      remoteStageViewMode,
      remoteVideoCount,
      remoteVideoStreams,
      selectedDevice,
      stageStatusLabel,
      videoFlowLabel,
    },
    warnings: {
      browserWebRtcUnavailableReason,
      forceJoin,
      normalJoinTakeoverHint,
      occupiedBySelfClient,
      occupyingParticipantLabel,
      roomJoinFailureMessage,
      selectedDeviceOccupied,
      selfDeviceBlockedReason,
      signalGatewayErrorHint,
    },
    insights: {
      quality: {
        autoReconnectEnabled,
        autoReconnectLabel,
        connectionQuality,
        onAutoReconnectEnabledChange: setAutoReconnectEnabled,
      },
      clipboard: {
        canCopyRemoteClipboard,
        canReadLocalClipboard,
        canSendClipboardText,
        clipboardSyncAvailable,
        clipboardSyncEnabled,
        localClipboardStatusLabel,
        remoteClipboardPendingText,
        remoteClipboardStatusLabel,
        onClipboardSyncEnabledChange: handleClipboardSyncEnabledChange,
        onCopyRemoteClipboard: handleCopyRemoteClipboard,
        onReadLocalClipboard: () => void handleReadLocalClipboard(),
        onSendClipboardText: handleSendClipboardText,
      },
      videoSources: {
        onRemoteVideoSourceChange: setSelectedRemoteVideoId,
        primaryRemoteVideoId,
        remoteVideoSources,
      },
    },
    settings: {
      autoConnect,
      browserRtcReady,
      busy,
      connectionRouteMode,
      forceJoin,
      onAutoConnectChange: setAutoConnect,
      onConnectionRouteModeChange: setConnectionRouteMode,
      onForceJoinChange: setForceJoin,
      onSignalServerIndexChange: setSignalServerIndex,
      onSdpTransportModeChange: setSdpTransportMode,
      onStartBrowserRemote: () => void handleStartBrowserRemote(),
      onStartSignalGateway: () => void handleStartSignalGateway(),
      onStopSignalGateway: () => void handleStopSignalGateway(),
      sdpTransportMode,
      selectedDevice,
      selectedParticipants,
      signalServerIndex,
      signalServerOptions,
    },
    diagnostics: {
      audioPlaybackLabel,
      autoSwitchThresholdLabel,
      browserIceServers,
      browserRemoteState,
      browserRtcDescription,
      browserStageLabel,
      candidatePairSummary,
      connectionPathLabel,
      controlChannelLabel,
      debugEvents,
      effectiveConnectionRouteLabel,
      iceControlStatusLabel,
      inboundAudioStatsLabel,
      inboundVideoStatsLabel,
      inputControlActive,
      joinModeLabel,
      networkSwitchSummary,
      remoteBootstrap,
      roomDebugPayload,
      roomJoinModeDebugLabel,
      roomReleaseDetail,
      roomReleaseLabel,
      runtimeProfile,
      selectedDevice,
      selectedDeviceId,
      serviceRoutePolicyLabel,
      signalEvents,
      signalGatewayDisplay,
      signalHeaderSummary,
      signalReadiness,
      sdpTransportLabel,
      textChannelLabel,
      unexpectedSignalEventSummary,
      videoElementLabel,
      videoFlowLabel,
    },
  };

  return {
    toast,
    onDismissToast: dismissToast,
    page: controlPageProps,
  };
}
