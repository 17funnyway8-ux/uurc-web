import { useEffect, useMemo, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router";

import {
  STREAMER_CONTROL_CONNECT_TYPES,
  STREAMER_DATA_CHANNEL_LABELS,
  analyzeRemoteSignalReadiness,
  buildDefaultStreamerConnectOptionsBase64,
  buildStreamerControlStreamerDataJson,
} from "@uurc/shared/streamerProtocol";
import type { RemoteSignalGatewayStatus, RuntimeProfile, RemoteAssistanceJoinResult } from "@uurc/shared/types";

import type { BusyAction, RoomJoinContext } from "../app/remoteControlTypes.js";
import { SELF_DEVICE_BLOCKED_REASON } from "../app/remoteControlTypes.js";
import {
  cancelRemoteAssistance,
  clearAuthState,
  clearRoomByDevice,
  createMobileDevice,
  exportAuthState,
  getAuthStatus,
  getDeviceGroups,
  getRemoteAssistanceControlMode,
  getRemoteBootstrap,
  getRuntimeProfile,
  getRemoteSignalDiagnostics,
  importAuthState,
  joinRemoteAssistanceByCode,
  joinRemoteAssistanceByConfirmation,
  joinRoomByDevice,
  loginByMobile,
  sendMobileCode,
  sendRemoteSignalControl,
  sendRemoteSignalSoac,
  startRemoteSignalGateway,
  stopRemoteSignalGateway,
} from "../api/client.js";
import { createRemoteControlPageProps, type RemoteControlViewProps } from "../app/remoteControlPageProps.js";
import { formatParticipantMeta } from "../devices/deviceLabels.js";
import { pickControllableDesktop } from "../devices/deviceSummary.js";
import { BrowserRemoteSession, type BrowserRemoteSessionState } from "../remote/browserRemoteSession.js";
import { remoteShortcutGroupTitleForPlatform } from "../remote/remoteShortcuts.js";
import {
  createAppControlId,
  createIdleBrowserRemoteState,
  formatAutoSwitchThresholds,
  formatBrowserRemoteStage,
  formatConnectionPath,
  formatDataChannelState,
  getRemoteConnectionQuality,
  formatInboundVideoStats,
  formatRemoteAssistanceMode,
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
import { useAutoLoadDevices } from "./useAutoLoadDevices.js";
import { useAccountController } from "./useAccountController.js";
import { useDeviceController } from "./useDeviceController.js";
import { useRemoteVideoController } from "./useRemoteVideoController.js";
import { useRemoteControlPreferences } from "./useRemoteControlPreferences.js";
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

// 手机号前端预校验：中国大陆区号要求 11 位、以 1 开头；其他区号只做非空+纯数字的宽松校验。
function isValidMobileNumber(regionCode: string, mobile: string): boolean {
  const digits = mobile.trim();
  if (!/^\d+$/.test(digits)) return false;
  const region = regionCode.trim() || "86";
  if (region === "86") return /^1\d{10}$/.test(digits);
  return digits.length >= 5 && digits.length <= 15;
}

export function useRemoteControlController() {
  const {
    authStatus,
    setAuthStatus,
    authJson,
    setAuthJson,
    regionCode,
    setRegionCode,
    mobile,
    setMobile,
    smsCode,
    setSmsCode,
    loginNotice,
    setLoginNotice,
    codeSent,
    setCodeSent,
    smsCountdown,
    setSmsCountdown,
  } = useAccountController();
  const {
    devices,
    setDevices,
    devicesLoaded,
    setDevicesLoaded,
    selectedDeviceIdState,
    setSelectedDeviceId,
    forceJoin,
    setForceJoin,
    assistanceConnectId,
    setAssistanceConnectId,
    assistanceConnectCode,
    setAssistanceConnectCode,
    assistanceNotice,
    setAssistanceNotice,
    resetDevices,
  } = useDeviceController();
  const {
    roomResponse,
    setRoomResponse,
    roomJoinContext,
    setRoomJoinContext,
    remoteBootstrap,
    setRemoteBootstrap,
    resetRoom,
  } = useRoomController();
  const [runtimeProfile, setRuntimeProfile] = useState<RuntimeProfile | null>(null);
  const [browserRemoteState, setBrowserRemoteState] = useState<BrowserRemoteSessionState>(createIdleBrowserRemoteState);
  const [autoReconnectAttemptCount, setAutoReconnectAttemptCount] = useState(0);
  const [decodeStalledStreak, setDecodeStalledStreak] = useState(0);
  const [autoReconnectStatus, setAutoReconnectStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<BusyAction>("status");
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
  const navigate = useNavigate();
  const controlRouteMatch = useMatch("/devices/:deviceId/control");
  const routeSelectedDeviceId = controlRouteMatch?.params.deviceId ?? "";

  const allDevices = useMemo(
    () => [...devices.desktopDevices, ...devices.mobileDevices, ...devices.tvDevices],
    [devices.desktopDevices, devices.mobileDevices, devices.tvDevices],
  );
  const selectedDeviceId = routeSelectedDeviceId || selectedDeviceIdState;

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
  const controlChannelState = browserRemoteState.dataChannels[STREAMER_DATA_CHANNEL_LABELS.control] ?? "closed";
  const {
    clipboardStatus,
    clipboardPreviewLabel,
    canReadLocalClipboard,
    canSendClipboardText,
    inputControlActive,
    isFullscreen,
    remoteStageRef,
    enableInputControl,
    resetInputControl,
    handleRemoteClipboard,
    handleReadLocalClipboard,
    handleSendClipboardText,
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
    busy,
    controlChannelState,
    textChannelState,
    targetPlatform: resolveTargetPlatform(),
    run,
    onError: setError,
    onSessionStateChange: setBrowserRemoteState,
    showToast,
  });
  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时恢复一次账号凭证
  }, []);

  async function run(action: BusyAction, task: () => Promise<void>) {
    setBusy(action);
    setError("");
    try {
      await task();
    } catch (caught) {
      setError(toFriendlyError(caught instanceof Error ? caught.message : String(caught)));
      // 远程协助失败时清除“等待对方确认…”等瞬态提示，避免与错误条同时显示矛盾信息
      if (action === "assistance") setAssistanceNotice("");
    } finally {
      setBusy(null);
    }
  }

  async function loadStatus() {
    await run("status", async () => {
      const [status, runtime] = await Promise.all([getAuthStatus(), getRuntimeProfile().catch(() => null)]);
      setAuthStatus(status);
      setRuntimeProfile(runtime);
    });
  }

  async function handleImport() {
    await run("import", async () => {
      const status = await importAuthState(authJson);
      setAuthStatus(status);
      if (!status.hasState) {
        const fieldLabels: Record<string, string> = { token: "令牌", userId: "用户 ID", deviceId: "设备 ID" };
        const missing = (status.missingFields ?? []).map((field) => fieldLabels[field] ?? field).join("、");
        throw new Error(missing ? `导入失败：账号凭证缺少 ${missing}` : "导入失败：账号凭证不完整");
      }
      setLoginNotice("已导入");
      setDevicesLoaded(false);
      navigate("/devices", { replace: true });
    });
  }

  async function handleExport() {
    await run("export", async () => {
      const state = await exportAuthState();
      setAuthJson(JSON.stringify(state, null, 2));
      showToast("已生成账号凭证备份，请妥善保管");
    });
  }

  async function handleCopyAuthJson() {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!authJson.trim()) return;
    if (!clipboard?.writeText) {
      showToast("当前环境不支持自动复制，请手动选择文本复制");
      return;
    }
    try {
      await clipboard.writeText(authJson);
      showToast("已复制账号凭证到剪贴板");
    } catch {
      showToast("复制失败，请手动选择文本复制");
    }
  }

  async function handleLogout() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("退出后需重新登录。若未导出账号凭证备份，建议先导出。确定退出？")
    ) {
      return;
    }
    await run("logout", async () => {
      resetBrowserRemoteSession();
      await stopRemoteSignalGateway().catch(() => undefined);
      if (roomJoinContext?.deviceId) {
        const releaseRoom =
          roomJoinContext.kind === "remote_assistance"
            ? cancelRemoteAssistance(roomJoinContext.connectId ?? roomJoinContext.deviceId)
            : clearRoomByDevice(roomJoinContext.deviceId);
        await releaseRoom.catch(() => undefined);
      }
      setAuthStatus(await clearAuthState());
      setAuthJson("");
      resetDevices();
      resetRoom();
      resetSignalGateway();
      setLoginNotice("");
      setCodeSent(false);
      setSmsCountdown(0);
      navigate("/login", { replace: true });
    });
  }

  async function ensureMobileDevice() {
    if (authStatus?.deviceId) return;
    const result = await createMobileDevice();
    setAuthStatus(result.status);
  }

  async function handleSendMobileCode() {
    await run("send-mobile-code", async () => {
      if (!isValidMobileNumber(regionCode, mobile)) {
        throw new Error(
          regionCode.trim() === "86" || !regionCode.trim() ? "请输入 11 位有效手机号。" : "请输入有效的手机号。",
        );
      }
      await ensureMobileDevice();
      const result = await sendMobileCode({ regionCode: regionCode.trim() || "86", mobile });
      setAuthStatus(result.status);
      setCodeSent(true);
      setSmsCountdown(60);
      setLoginNotice("验证码已发送");
    });
  }

  async function handleMobileLogin() {
    await run("mobile-login", async () => {
      await ensureMobileDevice();
      const result = await loginByMobile({ regionCode: regionCode.trim() || "86", mobile, code: smsCode });
      setAuthStatus(result.status);
      setLoginNotice("已登录");
      setDevicesLoaded(false);
      navigate("/devices", { replace: true });
    });
  }

  async function loadDevices() {
    await run("devices", async () => {
      const nextDevices = await getDeviceGroups();
      setDevices(nextDevices);
      setDevicesLoaded(true);
      const target = pickControllableDesktop(nextDevices.desktopDevices, authStatus?.deviceId);
      setSelectedDeviceId(target?.deviceId ?? nextDevices.desktopDevices[0]?.deviceId ?? "");
    });
  }

  async function handleOpenDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    navigate(`/devices/${encodeURIComponent(deviceId)}/control`);
  }

  async function handleStartRemoteAssistance() {
    if (busy !== null) return;
    if (!loggedIn) {
      setError("远程协助需要先登录 UU 账号。");
      return;
    }

    setAssistanceNotice("");
    await run("assistance", async () => {
      const connectId = assistanceConnectId.trim();
      const connectCode = assistanceConnectCode.trim();
      const modeResult = await getRemoteAssistanceControlMode(connectId);
      if (modeResult.upstream.body.code !== undefined && modeResult.upstream.body.code !== 0) {
        throw new Error(modeResult.upstream.body.msg ?? `远程协助模式返回 ${modeResult.upstream.body.code}`);
      }
      if (!modeResult.canRemoteControl) {
        throw new Error("伙伴设备当前不允许远程协助");
      }
      if (!modeResult.controlMode) {
        throw new Error("伙伴设备未返回可识别的验证方式");
      }

      let joined: RemoteAssistanceJoinResult;
      if (connectCode) {
        joined = await joinRemoteAssistanceByCode({
          connectId,
          connectCode,
          controlMode: modeResult.controlMode,
        });
        if (!joined.roomConfigSummary && joined.assistance.confirmationRequired) {
          setAssistanceNotice("伙伴设备要求二次确认，正在等待对方确认...");
          joined = await joinRemoteAssistanceByConfirmation({
            connectId,
            connectCode,
            controlId: joined.assistance.controlId,
            controlMode: modeResult.controlMode,
          });
        }
      } else if (modeResult.controlMode === "by_confirmation" || modeResult.controlMode === "password_confirmation") {
        setAssistanceNotice("正在等待伙伴设备确认...");
        joined = await joinRemoteAssistanceByConfirmation({
          connectId,
          controlMode: modeResult.controlMode,
        });
      } else {
        throw new Error("伙伴设备当前要求输入设备验证码");
      }

      if (!joined.roomConfigSummary) {
        throw new Error(joined.upstream.body.msg ?? "远程协助未返回可用房间配置");
      }
      const targetPlatform = joined.assistance.targetPlatform;
      if (targetPlatform === undefined) {
        throw new Error("伙伴设备未返回设备系统，已取消本次远程协助");
      }

      const context: RoomJoinContext = {
        kind: "remote_assistance",
        deviceId: joined.assistance.connectId,
        forceJoin: false,
        occupiedAtJoin: false,
        connectId: joined.assistance.connectId,
        connectCodeProvided: joined.assistance.connectCodeProvided,
        controlId: joined.assistance.controlId,
        controlMode: joined.assistance.controlMode,
        deviceName: joined.assistance.deviceName,
        targetPlatform,
      };
      setSelectedDeviceId(joined.assistance.connectId);
      setRoomResponse(joined);
      setRoomJoinContext(context);
      setForceJoin(false);
      resetSignalGateway();
      resetBrowserRemoteSession();
      setRemoteBootstrap(await getRemoteBootstrap());
      setAssistanceNotice(`已进入远程协助：${formatRemoteAssistanceMode(modeResult.controlMode)}`);
      navigate(`/devices/${encodeURIComponent(joined.assistance.connectId)}/control`);
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
      setAssistanceNotice("");
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
          setDevices(await getDeviceGroups());
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
    navigate("/devices");
  }

  function resetBrowserRemoteSession() {
    const closedState = browserRemoteSession.current?.close();
    browserRemoteSession.current = null;
    resetInputControl();
    resetRemoteVideos();
    setBrowserRemoteState(closedState ?? createIdleBrowserRemoteState());
  }

  async function startBrowserRemoteSession(options: { skipReadinessCheck?: boolean; forceRelay?: boolean } = {}) {
    if (browserWebRtcUnavailableReason) throw new Error(browserWebRtcUnavailableReason);
    if (!authStatus?.deviceId) throw new Error("登录已失效");
    if (!selectedDeviceId) throw new Error("请选择设备");
    if (!options.skipReadinessCheck && !roomReadyForBrowserRtc) throw new Error(browserRtcBlockedReason);
    resetInputControl();
    const appControlId = createAppControlId();
    const session = new BrowserRemoteSession({
      api: {
        sendSignalControl: sendRemoteSignalControl,
        sendSignalSoac: sendRemoteSignalSoac,
      },
      onRemoteStream: handleRemoteMediaStream,
      onRemoteClipboard: handleRemoteClipboard,
      onStateChange: setBrowserRemoteState,
    });
    browserRemoteSession.current = session;
    const controlConnectType =
      roomJoinContext?.kind === "remote_assistance"
        ? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Assistance
        : STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal;
    const state = await session.start({
      appControlId,
      appDataBase64: buildDefaultStreamerConnectOptionsBase64({
        deviceId: authStatus.deviceId,
        controlConnectType,
      }),
      streamerData: buildStreamerControlStreamerDataJson({ controlId: appControlId }),
      forceRelay: options.forceRelay ?? (connectionRouteMode === "relay" ? true : undefined),
      gzipSdp: sdpTransportMode === "gzip",
      targetPlatform: resolveTargetPlatform(),
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
  const canSubmitMobile = mobile.trim().length > 0 && busy === null && smsCountdown === 0;
  const canLogin = mobile.trim().length > 0 && smsCode.trim().length > 0 && busy === null;

  useAutoLoadDevices({
    loggedIn,
    devicesLoaded,
    busy,
    loadDevices: () => void loadDevices(),
  });

  const identitySourceLabel = authStatus?.deviceId ? "网页控制端" : "待创建设备";
  const identityDeviceLabel = authStatus?.deviceId ?? "-";
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
  const inboundVideoStatsLabel = formatInboundVideoStats(browserRemoteState.inboundVideo);
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
    if (!controlRouteMatch) {
      autoConnectAttemptedDeviceRef.current = "";
      return;
    }
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
    controlRouteMatch,
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

  const loginPageProps = {
    authJson,
    regionCode,
    mobile,
    smsCode,
    loginNotice,
    codeSent,
    smsCountdown,
    error,
    busy,
    canSubmitMobile,
    canLogin,
    onAuthJsonChange: setAuthJson,
    onRegionCodeChange: setRegionCode,
    onMobileChange: setMobile,
    onSmsCodeChange: setSmsCode,
    onSendMobileCode: () => void handleSendMobileCode(),
    onMobileLogin: () => void handleMobileLogin(),
    onImport: () => void handleImport(),
  };

  const deviceListPageProps = {
    authStatus,
    authJson,
    devices,
    devicesLoaded,
    selectedDeviceId,
    assistanceConnectId,
    assistanceConnectCode,
    assistanceNotice,
    identitySourceLabel,
    identityDeviceLabel,
    error,
    busy,
    onLoadStatus: () => void loadStatus(),
    onLoadDevices: () => void loadDevices(),
    onSelectDevice: setSelectedDeviceId,
    onOpenDevice: (deviceId: string) => void handleOpenDevice(deviceId),
    onAssistanceConnectIdChange: setAssistanceConnectId,
    onAssistanceConnectCodeChange: setAssistanceConnectCode,
    onStartRemoteAssistance: () => void handleStartRemoteAssistance(),
    onExport: () => void handleExport(),
    onCopyAuthJson: () => void handleCopyAuthJson(),
    onLogout: () => void handleLogout(),
  };

  const controlViewProps: RemoteControlViewProps = {
    autoSwitchThresholdLabel,
    autoConnect,
    autoReconnectEnabled,
    autoReconnectLabel,
    browserIceServers,
    browserRemoteState,
    browserWebRtcUnavailableReason,
    browserRtcDescription,
    browserRtcReady,
    browserStageLabel,
    busy,
    canDisconnectRemote,
    canReadLocalClipboard,
    canReconnectRemote: browserConnectionRecoverable,
    canSendClipboardText,
    candidatePairSummary,
    clipboardPreviewLabel,
    clipboardStatusLabel: clipboardStatus,
    connectionQuality,
    connectionPathLabel,
    connectionRouteMode,
    controlChannelLabel,
    controlChannelState,
    debugEvents,
    deviceNotFound,
    effectiveConnectionRouteLabel,
    error,
    forceJoin,
    hasRemoteVideo,
    iceControlStatusLabel,
    inboundVideoStatsLabel,
    inputControlActive,
    inputControlLabel,
    joinModeLabel,
    networkSwitchSummary,
    nextAction,
    normalJoinTakeoverHint,
    occupiedBySelfClient,
    occupyingParticipantLabel,
    primaryRemoteVideoActive,
    primaryRemoteVideoId,
    remoteBootstrap,
    remoteRecoveryLabel,
    remoteShortcutPlatform,
    remoteStageRef,
    remoteStageFrameRef,
    isFullscreen,
    remoteStageViewMode,
    remoteVideoCount,
    remoteVideoSources,
    remoteVideoStreams,
    stageStatusLabel,
    roomDebugPayload,
    roomJoinFailureMessage,
    roomJoinFailureTakeoverHint,
    roomJoinModeDebugLabel,
    roomReleaseDetail,
    roomReleaseLabel,
    roomResponseReady: Boolean(roomResponse),
    runtimeProfile,
    roomRequiresTakeover,
    sdpTransportLabel,
    sdpTransportMode,
    selectedDevice,
    selectedDeviceId,
    selectedTargetLabel,
    selectedDeviceOccupied,
    selectedParticipants,
    selfDeviceBlockedReason,
    serviceRoutePolicyLabel,
    signalEvents,
    signalGatewayDisplay,
    signalGatewayErrorHint,
    signalHeaderSummary,
    signalReadiness,
    signalServerIndex,
    signalServerOptions,
    textChannelLabel,
    textChannelState,
    unexpectedSignalEventSummary,
    videoElementLabel,
    videoFlowLabel,
    onAutoReconnectEnabledChange: setAutoReconnectEnabled,
    onAutoConnectChange: setAutoConnect,
    onConnectionRouteModeChange: setConnectionRouteMode,
    onForceJoinChange: setForceJoin,
    onNextAction: () => void handleNextAction(),
    onReconnectRemote: () => void handleReconnectRemote(),
    onRemoteStageKeyDown: handleRemoteStageKeyDown,
    onRemoteStageKeyUp: handleRemoteStageKeyUp,
    onRemoteStageBlur: handleRemoteStageBlur,
    onRemoteStagePaste: handleRemoteStagePaste,
    onRemoteStagePointerCancel: handleRemoteStagePointerCancel,
    onRemoteStagePointerDown: handleRemoteStagePointerDown,
    onRemoteStagePointerMove: handleRemoteStagePointerMove,
    onRemoteStagePointerUp: handleRemoteStagePointerUp,
    onRemoteStageWheel: handleRemoteStageWheel,
    onRemoteShortcut: handleRemoteShortcut,
    onRemoteVideoSourceChange: setSelectedRemoteVideoId,
    onRemoteVideoSample: handleRemoteVideoSample,
    onReadLocalClipboard: () => void handleReadLocalClipboard(),
    onReturnToDevices: () => void handleReturnToDevices(),
    onSdpTransportModeChange: setSdpTransportMode,
    onSignalServerIndexChange: setSignalServerIndex,
    onStartBrowserRemote: () => void handleStartBrowserRemote(),
    onStartSignalGateway: () => void handleStartSignalGateway(),
    onStageViewModeChange: setRemoteStageViewMode,
    onStopSignalGateway: () => void handleStopSignalGateway(),
    onSendClipboardText: handleSendClipboardText,
    onToggleInputControl: handleToggleInputControl,
    onToggleFullscreen: handleToggleFullscreen,
  };
  const controlPageProps = createRemoteControlPageProps(controlViewProps);

  return {
    authLoading: authStatus === null && busy === "status",
    loggedIn,
    toast,
    onDismissToast: dismissToast,
    loginPageProps,
    deviceListPageProps,
    controlPageProps,
  };
}
