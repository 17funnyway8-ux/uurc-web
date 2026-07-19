import type { ClipboardEvent, KeyboardEvent, PointerEvent, RefObject, WheelEvent } from "react";

import type {
  RemoteControlBootstrap,
  RemoteSignalGatewayEvent,
  RemoteSignalReadinessDiagnostics,
  RuntimeProfile,
  UuDevice,
  UuParticipantInfo,
} from "@uurc/shared/types";

import type { BrowserRemoteSessionState, BrowserRemoteVideoElementSample } from "../remote/browserRemoteSession.js";
import type { RemoteShortcut } from "../remote/remoteShortcuts.js";
import type {
  BusyAction,
  ConnectionRouteMode,
  NextAction,
  RemoteAudioPlaybackState,
  RemoteConnectionQuality,
  RemoteStageViewMode,
  RemoteVideoSourceInfo,
  RemoteVideoStream,
  SdpTransportMode,
} from "./remoteControlTypes.js";

export interface RemoteAudioControlProps {
  elementRef: RefObject<HTMLAudioElement | null>;
  available: boolean;
  muted: boolean;
  volume: number;
  playbackState: RemoteAudioPlaybackState;
  playbackErrorName: string;
  onToggleMuted: () => void;
  onVolumeChange: (volume: number) => void;
  onResumePlayback: () => void;
}

export interface RemoteControlViewProps {
  audioPlaybackLabel: string;
  autoSwitchThresholdLabel: string;
  browserIceServers: number;
  browserRemoteState: BrowserRemoteSessionState;
  browserRtcDescription: string;
  browserRtcReady: boolean;
  browserStageLabel: string;
  busy: BusyAction;
  autoReconnectAttemptCount: number;
  autoReconnectEnabled: boolean;
  autoReconnectLabel: string;
  canDisconnectRemote: boolean;
  canCopyRemoteClipboard: boolean;
  canReadLocalClipboard: boolean;
  canReconnectRemote: boolean;
  canSendClipboardText: boolean;
  browserWebRtcUnavailableReason: string;
  candidatePairSummary: string;
  clipboardSyncAvailable: boolean;
  clipboardSyncEnabled: boolean;
  clipboardPreviewLabel: string;
  localClipboardStatusLabel: string;
  remoteClipboardPendingText: string | null;
  remoteClipboardStatusLabel: string;
  connectionQuality: RemoteConnectionQuality;
  connectionPathLabel: string;
  autoConnect: boolean;
  connectionRouteMode: ConnectionRouteMode;
  controlChannelLabel: string;
  controlChannelState: RTCDataChannelState;
  debugEvents: BrowserRemoteSessionState["debugEvents"];
  deviceNotFound: boolean;
  effectiveConnectionRouteLabel: string;
  error: string;
  forceJoin: boolean;
  hasRemoteVideo: boolean;
  iceControlStatusLabel: string;
  inboundAudioStatsLabel: string;
  inboundVideoStatsLabel: string;
  inputControlActive: boolean;
  inputControlLabel: string;
  joinModeLabel: string;
  networkSwitchSummary: string;
  nextAction: NextAction;
  normalJoinTakeoverHint: string;
  occupiedBySelfClient: boolean;
  occupyingParticipantLabel: string;
  primaryRemoteVideoActive: boolean;
  primaryRemoteVideoId: string;
  remoteBootstrap: RemoteControlBootstrap | null;
  remoteAudio: RemoteAudioControlProps;
  remoteRecoveryLabel: string;
  remoteShortcutPlatform: string;
  remoteStageRef: RefObject<HTMLDivElement | null>;
  remoteStageFrameRef: RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  remoteStageViewMode: RemoteStageViewMode;
  remoteVideoCount: number;
  remoteVideoSources: RemoteVideoSourceInfo[];
  remoteVideoStreams: RemoteVideoStream[];
  stageStatusLabel: string;
  roomDebugPayload: unknown;
  roomJoinFailureMessage: string;
  roomJoinFailureTakeoverHint: string;
  roomJoinModeDebugLabel: string;
  roomReleaseDetail: string;
  roomReleaseLabel: string;
  roomResponseReady: boolean;
  runtimeProfile: RuntimeProfile | null;
  roomRequiresTakeover: boolean;
  sdpTransportLabel: string;
  sdpTransportMode: SdpTransportMode;
  selectedDevice: UuDevice | null;
  selectedDeviceId: string;
  selectedTargetLabel: string;
  selectedDeviceOccupied: boolean;
  selectedParticipants: UuParticipantInfo[];
  selfDeviceBlockedReason: string;
  serviceRoutePolicyLabel: string;
  signalEvents: RemoteSignalGatewayEvent[];
  signalGatewayDisplay: string;
  signalGatewayErrorHint: string;
  signalHeaderSummary: string;
  signalReadiness: RemoteSignalReadinessDiagnostics;
  signalServerIndex: number;
  signalServerOptions: string[];
  textChannelLabel: string;
  textChannelState: RTCDataChannelState;
  unexpectedSignalEventSummary: string;
  videoElementLabel: string;
  videoFlowLabel: string;
  onAutoConnectChange: (enabled: boolean) => void;
  onClipboardSyncEnabledChange: (enabled: boolean) => void;
  onConnectionRouteModeChange: (mode: ConnectionRouteMode) => void;
  onCopyRemoteClipboard: () => void;
  onAutoReconnectEnabledChange: (enabled: boolean) => void;
  onForceJoinChange: (forceJoin: boolean) => void;
  onNextAction: () => void;
  onReconnectRemote: () => void;
  onRemoteStageKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRemoteStageKeyUp: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRemoteStageBlur: () => void;
  onRemoteStagePaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onRemoteStagePointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStagePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStagePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStagePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStageWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onRemoteShortcut: (shortcut: RemoteShortcut) => void;
  onRemoteVideoSourceChange: (videoId: string) => void;
  onRemoteVideoSample: (videoId: string, sample: BrowserRemoteVideoElementSample) => void;
  onReadLocalClipboard: () => void;
  onReturnToDevices: () => void;
  onSdpTransportModeChange: (mode: SdpTransportMode) => void;
  onSignalServerIndexChange: (index: number) => void;
  onStartBrowserRemote: () => void;
  onStartSignalGateway: () => void;
  onStageViewModeChange: (mode: RemoteStageViewMode) => void;
  onStopSignalGateway: () => void;
  onSendClipboardText: () => void;
  onToggleInputControl: () => void;
  onToggleFullscreen: () => void;
}

export type RemoteControlShellProps = Pick<
  RemoteControlViewProps,
  "deviceNotFound" | "error" | "isFullscreen" | "onReturnToDevices" | "remoteStageFrameRef"
>;

export type RemoteControlTopbarProps = Pick<
  RemoteControlViewProps,
  | "browserRemoteState"
  | "busy"
  | "canDisconnectRemote"
  | "onReturnToDevices"
  | "onStopSignalGateway"
  | "selectedDevice"
  | "selectedTargetLabel"
  | "signalGatewayDisplay"
>;

export type RemoteCommandBarProps = Pick<
  RemoteControlViewProps,
  | "autoReconnectAttemptCount"
  | "busy"
  | "canReconnectRemote"
  | "controlChannelState"
  | "inputControlActive"
  | "isFullscreen"
  | "nextAction"
  | "onNextAction"
  | "onReconnectRemote"
  | "onRemoteShortcut"
  | "onStageViewModeChange"
  | "onToggleInputControl"
  | "onToggleFullscreen"
  | "remoteAudio"
  | "remoteRecoveryLabel"
  | "remoteShortcutPlatform"
  | "remoteStageViewMode"
>;

export type RemoteControlStageProps = Pick<
  RemoteControlViewProps,
  | "browserRemoteState"
  | "browserStageLabel"
  | "hasRemoteVideo"
  | "inputControlActive"
  | "inputControlLabel"
  | "onRemoteStageKeyDown"
  | "onRemoteStageKeyUp"
  | "onRemoteStageBlur"
  | "onRemoteStagePaste"
  | "onRemoteStagePointerCancel"
  | "onRemoteStagePointerDown"
  | "onRemoteStagePointerMove"
  | "onRemoteStagePointerUp"
  | "onRemoteStageWheel"
  | "onRemoteVideoSample"
  | "primaryRemoteVideoActive"
  | "primaryRemoteVideoId"
  | "remoteStageRef"
  | "remoteStageViewMode"
  | "remoteVideoCount"
  | "remoteVideoStreams"
  | "selectedDevice"
  | "stageStatusLabel"
  | "videoFlowLabel"
>;

export type RemoteControlWarningsProps = Pick<
  RemoteControlViewProps,
  | "browserWebRtcUnavailableReason"
  | "forceJoin"
  | "normalJoinTakeoverHint"
  | "occupiedBySelfClient"
  | "occupyingParticipantLabel"
  | "roomJoinFailureMessage"
  | "selectedDeviceOccupied"
  | "selfDeviceBlockedReason"
  | "signalGatewayErrorHint"
>;

export type RemoteConnectionQualityPanelProps = Pick<
  RemoteControlViewProps,
  "autoReconnectEnabled" | "autoReconnectLabel" | "connectionQuality" | "onAutoReconnectEnabledChange"
>;

export type RemoteClipboardPanelProps = Pick<
  RemoteControlViewProps,
  | "canCopyRemoteClipboard"
  | "canReadLocalClipboard"
  | "canSendClipboardText"
  | "clipboardSyncAvailable"
  | "clipboardSyncEnabled"
  | "clipboardPreviewLabel"
  | "localClipboardStatusLabel"
  | "remoteClipboardPendingText"
  | "remoteClipboardStatusLabel"
  | "onClipboardSyncEnabledChange"
  | "onCopyRemoteClipboard"
  | "onReadLocalClipboard"
  | "onSendClipboardText"
>;

export type RemoteVideoSourcePanelProps = Pick<
  RemoteControlViewProps,
  "onRemoteVideoSourceChange" | "primaryRemoteVideoId" | "remoteVideoSources"
>;

export interface RemoteControlInsightsProps {
  quality: RemoteConnectionQualityPanelProps;
  clipboard: RemoteClipboardPanelProps;
  videoSources: RemoteVideoSourcePanelProps;
}

export type RemoteControlSettingsDrawerProps = Pick<
  RemoteControlViewProps,
  | "autoConnect"
  | "browserRtcReady"
  | "busy"
  | "connectionRouteMode"
  | "forceJoin"
  | "onAutoConnectChange"
  | "onConnectionRouteModeChange"
  | "onForceJoinChange"
  | "onSignalServerIndexChange"
  | "onSdpTransportModeChange"
  | "onStartBrowserRemote"
  | "onStartSignalGateway"
  | "onStopSignalGateway"
  | "sdpTransportMode"
  | "selectedDevice"
  | "selectedParticipants"
  | "signalServerIndex"
  | "signalServerOptions"
>;

export type RemoteControlDiagnosticsDrawerProps = Pick<
  RemoteControlViewProps,
  | "audioPlaybackLabel"
  | "autoSwitchThresholdLabel"
  | "browserIceServers"
  | "browserRemoteState"
  | "browserRtcDescription"
  | "browserStageLabel"
  | "candidatePairSummary"
  | "connectionPathLabel"
  | "controlChannelLabel"
  | "debugEvents"
  | "effectiveConnectionRouteLabel"
  | "iceControlStatusLabel"
  | "inboundAudioStatsLabel"
  | "inboundVideoStatsLabel"
  | "inputControlActive"
  | "joinModeLabel"
  | "networkSwitchSummary"
  | "remoteBootstrap"
  | "roomDebugPayload"
  | "roomJoinModeDebugLabel"
  | "roomReleaseDetail"
  | "roomReleaseLabel"
  | "runtimeProfile"
  | "selectedDevice"
  | "selectedDeviceId"
  | "serviceRoutePolicyLabel"
  | "signalEvents"
  | "signalGatewayDisplay"
  | "signalHeaderSummary"
  | "signalReadiness"
  | "sdpTransportLabel"
  | "textChannelLabel"
  | "unexpectedSignalEventSummary"
  | "videoElementLabel"
  | "videoFlowLabel"
>;

export interface RemoteControlPageProps {
  shell: RemoteControlShellProps;
  topbar: RemoteControlTopbarProps;
  commandBar: RemoteCommandBarProps;
  stage: RemoteControlStageProps;
  warnings: RemoteControlWarningsProps;
  insights: RemoteControlInsightsProps;
  settings: RemoteControlSettingsDrawerProps;
  diagnostics: RemoteControlDiagnosticsDrawerProps;
}

export function createRemoteControlPageProps(props: RemoteControlViewProps): RemoteControlPageProps {
  return {
    shell: pick(props, ["deviceNotFound", "error", "isFullscreen", "onReturnToDevices", "remoteStageFrameRef"]),
    topbar: pick(props, [
      "browserRemoteState",
      "busy",
      "canDisconnectRemote",
      "onReturnToDevices",
      "onStopSignalGateway",
      "selectedDevice",
      "selectedTargetLabel",
      "signalGatewayDisplay",
    ]),
    commandBar: pick(props, [
      "autoReconnectAttemptCount",
      "busy",
      "canReconnectRemote",
      "controlChannelState",
      "inputControlActive",
      "isFullscreen",
      "nextAction",
      "onNextAction",
      "onReconnectRemote",
      "onRemoteShortcut",
      "onStageViewModeChange",
      "onToggleInputControl",
      "onToggleFullscreen",
      "remoteAudio",
      "remoteRecoveryLabel",
      "remoteShortcutPlatform",
      "remoteStageViewMode",
    ]),
    stage: pick(props, [
      "browserRemoteState",
      "browserStageLabel",
      "hasRemoteVideo",
      "inputControlActive",
      "inputControlLabel",
      "onRemoteStageKeyDown",
      "onRemoteStageKeyUp",
      "onRemoteStageBlur",
      "onRemoteStagePaste",
      "onRemoteStagePointerCancel",
      "onRemoteStagePointerDown",
      "onRemoteStagePointerMove",
      "onRemoteStagePointerUp",
      "onRemoteStageWheel",
      "onRemoteVideoSample",
      "primaryRemoteVideoActive",
      "primaryRemoteVideoId",
      "remoteStageRef",
      "remoteStageViewMode",
      "remoteVideoCount",
      "remoteVideoStreams",
      "selectedDevice",
      "stageStatusLabel",
      "videoFlowLabel",
    ]),
    warnings: pick(props, [
      "browserWebRtcUnavailableReason",
      "forceJoin",
      "normalJoinTakeoverHint",
      "occupiedBySelfClient",
      "occupyingParticipantLabel",
      "roomJoinFailureMessage",
      "selectedDeviceOccupied",
      "selfDeviceBlockedReason",
      "signalGatewayErrorHint",
    ]),
    insights: {
      quality: pick(props, [
        "autoReconnectEnabled",
        "autoReconnectLabel",
        "connectionQuality",
        "onAutoReconnectEnabledChange",
      ]),
      clipboard: pick(props, [
        "canCopyRemoteClipboard",
        "canReadLocalClipboard",
        "canSendClipboardText",
        "clipboardSyncAvailable",
        "clipboardSyncEnabled",
        "clipboardPreviewLabel",
        "localClipboardStatusLabel",
        "remoteClipboardPendingText",
        "remoteClipboardStatusLabel",
        "onClipboardSyncEnabledChange",
        "onCopyRemoteClipboard",
        "onReadLocalClipboard",
        "onSendClipboardText",
      ]),
      videoSources: pick(props, ["onRemoteVideoSourceChange", "primaryRemoteVideoId", "remoteVideoSources"]),
    },
    settings: pick(props, [
      "autoConnect",
      "browserRtcReady",
      "busy",
      "connectionRouteMode",
      "forceJoin",
      "onAutoConnectChange",
      "onConnectionRouteModeChange",
      "onForceJoinChange",
      "onSignalServerIndexChange",
      "onSdpTransportModeChange",
      "onStartBrowserRemote",
      "onStartSignalGateway",
      "onStopSignalGateway",
      "sdpTransportMode",
      "selectedDevice",
      "selectedParticipants",
      "signalServerIndex",
      "signalServerOptions",
    ]),
    diagnostics: pick(props, [
      "audioPlaybackLabel",
      "autoSwitchThresholdLabel",
      "browserIceServers",
      "browserRemoteState",
      "browserRtcDescription",
      "browserStageLabel",
      "candidatePairSummary",
      "connectionPathLabel",
      "controlChannelLabel",
      "debugEvents",
      "effectiveConnectionRouteLabel",
      "iceControlStatusLabel",
      "inboundAudioStatsLabel",
      "inboundVideoStatsLabel",
      "inputControlActive",
      "joinModeLabel",
      "networkSwitchSummary",
      "remoteBootstrap",
      "roomDebugPayload",
      "roomJoinModeDebugLabel",
      "roomReleaseDetail",
      "roomReleaseLabel",
      "runtimeProfile",
      "selectedDevice",
      "selectedDeviceId",
      "serviceRoutePolicyLabel",
      "signalEvents",
      "signalGatewayDisplay",
      "signalHeaderSummary",
      "signalReadiness",
      "sdpTransportLabel",
      "textChannelLabel",
      "unexpectedSignalEventSummary",
      "videoElementLabel",
      "videoFlowLabel",
    ]),
  };
}

function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}
