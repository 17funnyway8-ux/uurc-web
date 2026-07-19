import {
  decodeStreamerControlMessage,
  encodeStreamerEchoResponseMessage,
  encodeStreamerEchoRequestMessage,
  encodeStreamerInputMessage,
  encodeStreamerTextMessage,
  STREAMER_SIMPLE_ACTION_TYPES,
  type DecodedStreamerControlMessage,
} from "@uurc/shared/streamer/controlChannel";
import {
  STREAMER_ICE_NETWORK_TYPES,
  buildStreamerRtcConfiguration,
  formatStreamerSignalControlFailure,
  getStreamerSignalControlFailure,
  type StreamerIceNetworkType,
} from "@uurc/shared/streamer/signal";
import {
  STREAMER_DATA_CHANNEL_LABELS,
  isStreamerDataChannelLabel,
  type StreamerDataChannelLabel,
} from "@uurc/shared/streamer/transport";
import type { RemoteSignalGatewayEvent } from "@uurc/shared/types";
import { BrowserRemoteClipboard } from "./browserRemote/clipboard.js";
import {
  dataChannelPayloadByteLength,
  dataChannelPayloadBytes,
  summarizeDataChannelPayload,
  summarizeDecodedControlMessage,
  summarizeCursorShape,
  summarizeInputMessage,
} from "./browserRemote/dataChannel.js";
import {
  diagnoseVideoFlow,
  diffVideoElementSample,
  formatVideoFlowDelta,
  isActiveVideoElementSample,
  positive,
  readInboundAudioStats,
  readInboundVideoStats,
  readSelectedCandidatePair,
  type BrowserRemoteStatsSample,
} from "./browserRemote/diagnostics.js";
import { BrowserRemoteInput, MOUSE_MOVE_BUFFERED_AMOUNT_LOW_THRESHOLD } from "./browserRemote/input.js";
import {
  applyVideoCodecPreferences,
  createMediaStream,
  extractCandidateType,
  extractRemoteDisplayId,
  getBrowserH264CodecPreferences,
  matchesScopedString,
  normalizeCandidate,
  normalizeSwitchNetworkNotify,
  readStringField,
  summarizeSignalEvent,
} from "./browserRemote/negotiation.js";
import { asRecord, createAbortError, dropUndefinedFields, getErrorMessage, isDesktopPlatform } from "./browserRemote/utils.js";
import type {
  BrowserRemoteAudioElementSample,
  BrowserRemoteDataChannel,
  BrowserRemoteDebugEvent,
  BrowserRemoteDebugEventKind,
  BrowserRemoteKeyboardInput,
  BrowserRemoteMouseButtonInput,
  BrowserRemoteMouseClickInput,
  BrowserRemoteMouseMoveOptions,
  BrowserRemoteMousePositionInput,
  BrowserRemoteMouseScrollInput,
  BrowserRemotePeerConnection,
  BrowserRemoteSessionOptions,
  BrowserRemoteSessionStartInput,
  BrowserRemoteSessionState,
  BrowserRemoteVideoElementSample,
  BrowserRemoteVideoFlowDelta,
} from "./browserRemoteSessionTypes.js";
import { applyOpusReceiverPreferencesToSdp } from "./remoteSdp.js";

export class BrowserRemoteSession {
  private static readonly maxDebugEvents = 120;
  private static readonly echoHeartbeatIntervalMs = 100;
  private static readonly echoHeartbeatDebugIntervalMs = 30000;
  private static readonly dataReceiveDebugIntervalMs = 30000;

  private readonly createPeerConnection: (configuration: RTCConfiguration) => BrowserRemotePeerConnection;
  private readonly getVideoCodecPreferences: () => RTCRtpCodec[];
  private readonly now: () => number;
  private readonly clipboard: BrowserRemoteClipboard;
  private readonly input: BrowserRemoteInput;
  private peer: BrowserRemotePeerConnection | null = null;
  private readonly dataChannels = new Map<StreamerDataChannelLabel, BrowserRemoteDataChannel>();
  private readonly incomingDataChannels = new Set<BrowserRemoteDataChannel>();
  private echoHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lastEchoHeartbeatDebugAtMs = 0;
  private readonly lastDataReceiveDebugAtMs = new Map<StreamerDataChannelLabel, number>();
  private debugEventId = 1;
  private debugEvents: BrowserRemoteDebugEvent[] = [];
  private appControlId = "";
  private clientId: string | undefined;
  private iceId: string | undefined;
  private gzipSdp = true;
  private iceNetworkType: StreamerIceNetworkType = STREAMER_ICE_NETWORK_TYPES.appAuto;
  private targetPlatform: number | undefined;
  private readonly processedSignalEventIds = new Set<number>();
  private queuedCandidates: RTCIceCandidateInit[] = [];
  private remoteStream: MediaStream | null = null;
  private remoteDisplayId: number | undefined;
  private remoteInputDisplayId: number | undefined;
  private sequence = 1;
  private previousStatsSample: BrowserRemoteStatsSample | undefined;
  private previousVideoElementSample: BrowserRemoteVideoElementSample | undefined;
  private lifecycleGeneration = 0;
  private state: BrowserRemoteSessionState = {
    appControlId: "",
    connectionPath: "unknown",
    dataChannels: {},
    debugEvents: [],
    remoteTrackCount: 0,
    stage: "idle",
  };

  constructor(private readonly options: BrowserRemoteSessionOptions) {
    this.createPeerConnection =
      options.createPeerConnection ??
      ((configuration) => new RTCPeerConnection(configuration) as BrowserRemotePeerConnection);
    this.getVideoCodecPreferences = options.getVideoCodecPreferences ?? getBrowserH264CodecPreferences;
    this.now = options.now ?? Date.now;
    this.clipboard = new BrowserRemoteClipboard({
      assertGeneration: (generation) => this.assertLifecycleGeneration(generation),
      currentGeneration: () => this.lifecycleGeneration,
      nextEnvelope: () => {
        const sequence = this.sequence++;
        return { sequence, timestampSeconds: this.streamerTimestampSeconds() };
      },
      now: this.now,
      onRemoteClipboard: options.onRemoteClipboard,
      recordDebugEvent: (kind, summary, details) => this.recordDebugEvent(kind, summary, details),
      sendDataChannel: (label, payload, event) => this.sendDataChannel(label, payload, event),
    });
    this.input = new BrowserRemoteInput({
      getControlChannel: () => this.dataChannels.get(STREAMER_DATA_CHANNEL_LABELS.control),
      getTargetPlatform: () => this.targetPlatform,
      now: this.now,
      recordDebugEvent: (summary, details) => this.recordDebugEvent("data_send", summary, details),
      sendInputData: (inputMessage, inputOptions) => this.sendInputData(inputMessage, inputOptions),
    });
  }

  private streamerTimestampSeconds(): number {
    return Math.floor(this.now() / 1000);
  }

  getState(): BrowserRemoteSessionState {
    return {
      ...this.state,
      audioElement: this.state.audioElement ? { ...this.state.audioElement } : undefined,
      dataChannels: { ...this.state.dataChannels },
      debugEvents: [...this.debugEvents],
      inboundAudio: this.state.inboundAudio ? { ...this.state.inboundAudio } : undefined,
      inboundVideo: this.state.inboundVideo ? { ...this.state.inboundVideo } : undefined,
      selectedCandidatePair: this.state.selectedCandidatePair ? { ...this.state.selectedCandidatePair } : undefined,
      videoElement: this.state.videoElement ? { ...this.state.videoElement } : undefined,
      videoFlow: this.state.videoFlow
        ? {
            ...this.state.videoFlow,
            delta: this.state.videoFlow.delta ? { ...this.state.videoFlow.delta } : undefined,
          }
        : undefined,
    };
  }

  close(): BrowserRemoteSessionState {
    this.lifecycleGeneration += 1;
    this.recordDebugEvent("session", "关闭浏览器远控会话", {
      stage: this.state.stage,
      appControlId: this.appControlId || undefined,
      iceId: this.iceId,
    });
    this.clipboard.reset("浏览器远控会话已关闭");
    this.stopEchoHeartbeat();
    for (const channel of this.dataChannels.values()) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      channel.onbufferedamountlow = null;
      if (channel.readyState !== "closed") {
        channel.close?.();
      }
    }
    this.dataChannels.clear();
    for (const channel of this.incomingDataChannels) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      channel.onbufferedamountlow = null;
      if (channel.readyState !== "closed") {
        channel.close?.();
      }
    }
    this.incomingDataChannels.clear();
    this.lastDataReceiveDebugAtMs.clear();
    if (this.peer) {
      this.peer.ondatachannel = null;
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.close?.();
    }
    this.peer = null;
    this.appControlId = "";
    this.clientId = undefined;
    this.iceId = undefined;
    this.targetPlatform = undefined;
    this.processedSignalEventIds.clear();
    this.queuedCandidates = [];
    this.remoteStream = null;
    this.remoteDisplayId = undefined;
    this.remoteInputDisplayId = undefined;
    this.input.reset();
    this.sequence = 1;
    this.previousStatsSample = undefined;
    this.previousVideoElementSample = undefined;
    this.options.onRemoteCursorShape?.(null);
    this.setState({
      appControlId: "",
      connectionPath: "unknown",
      dataChannels: {},
      debugEvents: this.debugEvents,
      remoteTrackCount: 0,
      stage: "idle",
    });
    return this.getState();
  }

  async start(input: BrowserRemoteSessionStartInput): Promise<BrowserRemoteSessionState> {
    const lifecycleGeneration = this.lifecycleGeneration + 1;
    this.lifecycleGeneration = lifecycleGeneration;
    this.clipboard.reset("新的浏览器远控会话已开始");
    this.recordDebugEvent("session", "启动 signal control", {
      appControlId: input.appControlId,
      gzipSdp: input.gzipSdp ?? true,
      forceRelay: input.forceRelay ?? false,
    });
    const control = await this.options.api.sendSignalControl({
      appControlId: input.appControlId,
      appDataBase64: input.appDataBase64,
      streamerData: input.streamerData,
    });
    this.assertLifecycleGeneration(lifecycleGeneration);
    const result = control.control.result;
    if (!result) {
      throw new Error("signal control ack did not include a ControlResult");
    }
    const failure = getStreamerSignalControlFailure(control.control);
    if (failure) {
      throw new Error(`signal control ack failed: ${formatStreamerSignalControlFailure(failure)}`);
    }

    this.appControlId = input.appControlId;
    this.clientId = result.clientId;
    this.iceId = result.iceId ?? input.iceId;
    this.gzipSdp = input.gzipSdp ?? true;
    this.iceNetworkType = input.iceNetworkType ?? STREAMER_ICE_NETWORK_TYPES.appAuto;
    this.targetPlatform = input.targetPlatform;
    this.processedSignalEventIds.clear();
    const peer = this.createPeerConnection(
      buildStreamerRtcConfiguration(result, { forceRelay: input.forceRelay === true }),
    );
    this.peer = peer;
    this.createStreamerDataChannels(peer, lifecycleGeneration);
    peer.ondatachannel = (event) => {
      if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
      this.attachIncomingDataChannel(event.channel as BrowserRemoteDataChannel, lifecycleGeneration);
    };
    this.createStreamerMediaTransceivers(peer);
    peer.onicecandidate = (event) => {
      if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
      void this.sendLocalCandidate(event.candidate?.toJSON?.() ?? null, lifecycleGeneration);
    };
    peer.ontrack = (event) => {
      if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
      this.applyRemoteTrack(event);
    };

    this.setState({
      appControlId: input.appControlId,
      clientId: result.clientId,
      connectionPath: "unknown",
      controlIceIdMatch: input.iceId && result.iceId ? input.iceId === result.iceId : undefined,
      controlResult: result,
      controlResultIceId: result.iceId,
      dataChannels: this.getDataChannelStates(),
      debugEvents: this.debugEvents,
      iceId: this.iceId,
      remoteTrackCount: 0,
      stage: "controlled",
    });
    this.recordDebugEvent("session", "control ack 成功", {
      clientId: this.clientId,
      iceId: this.iceId,
      iceServers: result.iceServers.length,
      forceRelay: result.forceRelay,
      autoSwitchNetwork: result.autoSwitchNetwork,
      targetPlatform: this.targetPlatform,
    });

    await this.createAndSendLocalOffer("offer", undefined, lifecycleGeneration);
    this.assertLifecycleGeneration(lifecycleGeneration);

    this.setState({
      ...this.state,
      stage: "offered",
    });
    return this.getState();
  }

  sendTextData(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const sequence = this.sequence;
    const timestampSeconds = this.streamerTimestampSeconds();
    const payload = encodeStreamerTextMessage({
      sequence,
      timestampMs: timestampSeconds,
      inputMessage: trimmed,
      displayId: this.remoteInputDisplayId,
    });
    this.sequence += 1;
    this.sendDataChannel(STREAMER_DATA_CHANNEL_LABELS.text, payload, {
      summary: "发送文本输入",
      details: {
        sequence,
        timestampSeconds,
        textLength: trimmed.length,
        inputDisplayId: this.remoteInputDisplayId,
        remoteDisplayId: this.remoteDisplayId,
        targetPlatform: this.targetPlatform,
      },
    });
  }

  sendClipboardText(text: string): Promise<void> {
    return this.clipboard.sendText(text);
  }

  requestRemoteClipboardText(): void {
    this.clipboard.requestText();
  }

  cancelRemoteClipboardRead(): void {
    this.clipboard.cancelRead();
  }

  sendMouseClick(input: BrowserRemoteMouseClickInput): void {
    this.input.sendMouseClick(input);
  }

  sendMouseMove(input: BrowserRemoteMousePositionInput, options: BrowserRemoteMouseMoveOptions = {}): void {
    this.input.sendMouseMove(input, options);
  }

  sendMouseButton(input: BrowserRemoteMouseButtonInput): void {
    this.input.sendMouseButton(input);
  }

  sendMouseScroll(input: BrowserRemoteMouseScrollInput): void {
    this.input.sendMouseScroll(input);
  }

  sendKeyboardInput(input: BrowserRemoteKeyboardInput): void {
    this.input.sendKeyboardInput(input);
  }

  sendTextInput(content: string): void {
    this.input.sendTextInput(content);
  }

  releaseAllInputs(): void {
    this.input.releaseAll();
  }

  async refreshConnectionStats(): Promise<BrowserRemoteSessionState> {
    if (!this.peer?.getStats) return this.getState();

    const report = await this.peer.getStats();
    const sampledAtMs = this.now();
    const previousFlowStatus = this.state.videoFlow?.status;
    const selectedCandidatePair = readSelectedCandidatePair(report);
    const inboundAudio = readInboundAudioStats(report);
    const inboundVideo = readInboundVideoStats(report);
    const videoFlow = diagnoseVideoFlow({
      nowMs: sampledAtMs,
      previous: this.previousStatsSample,
      current: {
        inboundVideo,
        sampledAtMs,
        selectedCandidatePair: selectedCandidatePair.pair,
      },
      previousVideoElement: this.previousVideoElementSample,
      currentVideoElement: this.state.videoElement,
    });
    this.previousStatsSample = {
      inboundVideo,
      sampledAtMs,
      selectedCandidatePair: selectedCandidatePair.pair,
    };
    this.setState({
      ...this.state,
      connectionPath: selectedCandidatePair.connectionPath,
      inboundAudio,
      inboundVideo,
      selectedCandidatePair: selectedCandidatePair.pair,
      videoFlow,
    });
    this.recordDebugEvent("stats", videoFlow.title, {
      status: videoFlow.status,
      delta: videoFlow.delta,
      inboundAudio,
      inboundVideo,
      selectedCandidatePair: selectedCandidatePair.pair,
    });
    // 诊断：画面从“正常”转入停滞时打一条醒目日志，便于在浏览器控制台定位“卡死那一刻”的成因。
    if (
      videoFlow.status !== previousFlowStatus &&
      (videoFlow.status === "transport_stalled" || videoFlow.status === "decode_stalled")
    ) {
      console.warn(
        `[uurc] 画面停滞 → ${videoFlow.status}（${videoFlow.detail}）` +
          ` path=${selectedCandidatePair.connectionPath}` +
          ` control=${this.state.dataChannels[STREAMER_DATA_CHANNEL_LABELS.control] ?? "?"}`,
        { delta: videoFlow.delta, candidatePair: selectedCandidatePair.pair, inboundVideo },
      );
    }
    return this.getState();
  }

  recordVideoElementSample(sample: BrowserRemoteVideoElementSample): BrowserRemoteSessionState {
    const previousPrimarySample = this.state.videoElement;
    const sampleIsActive = isActiveVideoElementSample(sample);
    const previousSampleIsActive = isActiveVideoElementSample(previousPrimarySample);
    const shouldUseSample = sampleIsActive || !previousSampleIsActive;
    if (!shouldUseSample) return this.getState();

    const nextPrimarySample = sample;

    const delta = diffVideoElementSample(this.previousVideoElementSample, nextPrimarySample);
    this.previousVideoElementSample = nextPrimarySample;
    const videoFlow =
      positive(delta.videoElementFrames) || positive(delta.videoElementTimeMs)
        ? {
            status: "receiving" as const,
            title: "Video 元素帧在增长",
            detail: formatVideoFlowDelta(dropUndefinedFields(delta) as BrowserRemoteVideoFlowDelta),
            delta: dropUndefinedFields(delta) as BrowserRemoteVideoFlowDelta,
            updatedAtMs: this.now(),
          }
        : (this.state.videoFlow ??
          diagnoseVideoFlow({
            nowMs: this.now(),
            previous: this.previousStatsSample,
            current: {
              inboundVideo: this.state.inboundVideo,
              sampledAtMs: this.now(),
              selectedCandidatePair: this.state.selectedCandidatePair,
            },
            previousVideoElement: this.state.videoElement,
            currentVideoElement: nextPrimarySample,
          }));
    this.setState({
      ...this.state,
      videoElement: nextPrimarySample,
      videoFlow,
    });
    if (
      sample.event !== "sample" ||
      positive(delta.videoElementFrames) ||
      positive(delta.videoElementTimeMs) ||
      (sampleIsActive && !previousSampleIsActive)
    ) {
      this.recordDebugEvent("video_element", `video ${sample.event}`, {
        ...sample,
        delta,
      });
    }
    return this.getState();
  }

  recordAudioElementSample(sample: BrowserRemoteAudioElementSample): BrowserRemoteSessionState {
    this.setState({
      ...this.state,
      audioElement: sample,
    });
    this.recordDebugEvent("audio_element", `audio ${sample.event}`, { ...sample });
    return this.getState();
  }

  async applySignalEvents(events: RemoteSignalGatewayEvent[]): Promise<void> {
    const lifecycleGeneration = this.lifecycleGeneration;
    for (const event of events) {
      if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
      if (this.processedSignalEventIds.has(event.id)) continue;
      if (event.direction !== "inbound") continue;
      if (event.event === "soac") {
        this.recordDebugEvent("signal", "收到 SOAC", summarizeSignalEvent(event));
        const payloads = Array.isArray(event.payload) ? event.payload : [event.payload];
        for (const payload of payloads) {
          await this.applySoacPayload(payload, lifecycleGeneration);
          if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
        }
        this.processedSignalEventIds.add(event.id);
        continue;
      }
      if (event.event === "switch_network_notify") {
        this.recordDebugEvent("signal", "收到切网通知", summarizeSignalEvent(event));
        try {
          await this.applySwitchNetworkNotify(event.payload, lifecycleGeneration);
        } catch (error) {
          if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
          throw error;
        }
        if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
        this.processedSignalEventIds.add(event.id);
        continue;
      }
      if (event.event === "forward_setting" || event.event === "device_capability") {
        this.applyRemoteDisplayCapability(event);
        this.processedSignalEventIds.add(event.id);
      }
    }
  }

  private createStreamerDataChannels(peer: BrowserRemotePeerConnection, lifecycleGeneration: number): void {
    for (const label of Object.values(STREAMER_DATA_CHANNEL_LABELS)) {
      const channel = peer.createDataChannel(label);
      channel.binaryType = "arraybuffer";
      if (label === STREAMER_DATA_CHANNEL_LABELS.control) {
        channel.bufferedAmountLowThreshold = MOUSE_MOVE_BUFFERED_AMOUNT_LOW_THRESHOLD;
        channel.onbufferedamountlow = () => {
          if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
          this.input.flushPendingMouseMove();
        };
      }
      channel.onopen = () => {
        if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
        this.recordDebugEvent("data_channel", `${label} open`, { label, readyState: channel.readyState });
        this.updateDataChannelState(label);
        if (label === STREAMER_DATA_CHANNEL_LABELS.control) {
          this.startEchoHeartbeat();
        }
      };
      channel.onclose = () => {
        if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
        this.recordDebugEvent("data_channel", `${label} close`, { label, readyState: channel.readyState });
        if (label === STREAMER_DATA_CHANNEL_LABELS.control) {
          console.warn(`[uurc] 控制数据通道关闭（${label}）→ 心跳停止，被控端可能停推画面`);
          this.input.clearPendingPointerMoves();
          this.stopEchoHeartbeat();
        } else if (label === STREAMER_DATA_CHANNEL_LABELS.text || label === STREAMER_DATA_CHANNEL_LABELS.file) {
          this.clipboard.reset("剪贴板数据通道已关闭");
        }
        this.updateDataChannelState(label);
      };
      channel.onerror = () => {
        if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
        this.recordDebugEvent("data_channel", `${label} error`, { label, readyState: channel.readyState });
        if (label === STREAMER_DATA_CHANNEL_LABELS.control && channel.readyState !== "open") {
          console.warn(`[uurc] 控制数据通道错误（${label}），readyState=${channel.readyState}`);
          this.stopEchoHeartbeat();
        } else if (
          (label === STREAMER_DATA_CHANNEL_LABELS.text || label === STREAMER_DATA_CHANNEL_LABELS.file) &&
          channel.readyState !== "open"
        ) {
          this.clipboard.reset("剪贴板数据通道发生错误");
        }
        this.updateDataChannelState(label);
      };
      channel.onmessage = (event) => {
        if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
        this.receiveDataChannelMessage(label, event.data, lifecycleGeneration);
      };
      this.dataChannels.set(label, channel);
    }
  }

  private attachIncomingDataChannel(channel: BrowserRemoteDataChannel, lifecycleGeneration: number): void {
    this.incomingDataChannels.add(channel);
    channel.binaryType = "arraybuffer";
    const label = channel.label;
    this.recordDebugEvent("data_channel", "收到远端创建的数据通道", {
      label,
      readyState: channel.readyState,
      recognized: isStreamerDataChannelLabel(label),
    });

    channel.onopen = () => {
      if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
      this.recordDebugEvent("data_channel", `${label} remote open`, { label, readyState: channel.readyState });
    };
    channel.onclose = () => {
      this.incomingDataChannels.delete(channel);
      if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
      this.recordDebugEvent("data_channel", `${label} remote close`, { label, readyState: channel.readyState });
    };
    channel.onerror = () => {
      if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
      this.recordDebugEvent("data_channel", `${label} remote error`, { label, readyState: channel.readyState });
    };
    channel.onmessage = isStreamerDataChannelLabel(label)
      ? (event) => {
          if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
          this.receiveDataChannelMessage(label, event.data, lifecycleGeneration);
        }
      : null;
  }

  private createStreamerMediaTransceivers(peer: BrowserRemotePeerConnection): void {
    const videoCodecs = this.getVideoCodecPreferences();
    for (let index = 0; index < 5; index += 1) {
      const transceiver = peer.addTransceiver("video", { direction: "recvonly" });
      applyVideoCodecPreferences(transceiver, videoCodecs);
    }
    peer.addTransceiver("audio", { direction: "recvonly" });
  }

  private async sendLocalCandidate(candidate: RTCIceCandidateInit | null, lifecycleGeneration: number): Promise<void> {
    if (!candidate?.candidate || !this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
    this.recordDebugEvent("signal", "发送本地 candidate", {
      appControlId: this.appControlId,
      clientId: this.clientId,
      iceId: this.iceId,
      sdpMid: candidate.sdpMid ?? undefined,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      candidateType: extractCandidateType(candidate.candidate),
    });
    await this.options.api.sendSignalSoac({
      type: "candidate",
      clientId: this.clientId,
      iceId: this.iceId,
      appControlId: this.appControlId,
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? undefined,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      },
    });
  }

  private async applySoacPayload(payload: unknown, lifecycleGeneration: number): Promise<void> {
    const peer = this.peer;
    if (!peer || !this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;

    const record = asRecord(payload);
    const data = asRecord(record?.data);
    if (!this.isCurrentSoacPayload(record, data)) return;
    if (!data) return;

    const type = data.type;
    if (type === "answer" || type === "restart_ice") {
      const sdp = typeof data.sdp === "string" ? data.sdp : undefined;
      if (!sdp) return;
      const signalingState = peer.signalingState;
      if (signalingState !== undefined && signalingState !== "have-local-offer") {
        console.warn(
          `[uurc] 忽略状态不匹配的 SOAC ${type}（signalingState=${signalingState}）→ 重协商未接上，画面可能停滞`,
        );
        this.recordDebugEvent("signal", "忽略状态不匹配的 SOAC answer", {
          type,
          signalingState,
          appControlId: readStringField(data, "app_control_id", "appControlId"),
          iceId: readStringField(data, "ice_id", "iceId"),
          sdpLength: sdp.length,
        });
        return;
      }
      try {
        await peer.setRemoteDescription({ type: "answer", sdp });
      } catch (error) {
        if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
        this.recordDebugEvent("signal", "应用 SOAC answer 失败", {
          type,
          error: error instanceof Error ? error.message : String(error),
          signalingState: peer.signalingState,
          appControlId: readStringField(data, "app_control_id", "appControlId"),
          iceId: readStringField(data, "ice_id", "iceId"),
          sdpLength: sdp.length,
        });
        return;
      }
      if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
      this.recordDebugEvent("signal", type === "restart_ice" ? "应用 restart_ice answer" : "应用 answer", {
        type,
        appControlId: readStringField(data, "app_control_id", "appControlId"),
        iceId: readStringField(data, "ice_id", "iceId"),
        sdpLength: sdp.length,
      });
      this.setState({
        ...this.state,
        stage: "connected",
      });
      await this.flushQueuedCandidates(peer, lifecycleGeneration);
      return;
    }

    if (type === "candidate") {
      const candidate = normalizeCandidate(data.candidate);
      if (!candidate) return;
      if (peer.remoteDescription) {
        try {
          await peer.addIceCandidate(candidate);
        } catch (error) {
          if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
          throw error;
        }
        if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
        this.recordDebugEvent("signal", "应用远端 candidate", {
          iceId: readStringField(data, "ice_id", "iceId"),
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          candidateType: candidate.candidate ? extractCandidateType(candidate.candidate) : undefined,
        });
      } else {
        if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
        this.queuedCandidates.push(candidate);
        this.recordDebugEvent("signal", "缓存远端 candidate", {
          iceId: readStringField(data, "ice_id", "iceId"),
          queuedCandidates: this.queuedCandidates.length,
          candidateType: candidate.candidate ? extractCandidateType(candidate.candidate) : undefined,
        });
      }
      return;
    }
  }

  private isCurrentSoacPayload(record: Record<string, unknown> | null, data: Record<string, unknown> | null): boolean {
    return (
      matchesScopedString(readStringField(record, "client_id", "clientId"), this.clientId) &&
      matchesScopedString(readStringField(data, "app_control_id", "appControlId"), this.appControlId) &&
      matchesScopedString(readStringField(data, "ice_id", "iceId"), this.iceId)
    );
  }

  private async createAndSendLocalOffer(
    type: "offer" | "restart_ice" = "offer",
    options?: RTCOfferOptions,
    lifecycleGeneration = this.lifecycleGeneration,
  ): Promise<void> {
    const peer = this.peer;
    if (!peer) return;
    this.assertLifecycleGeneration(lifecycleGeneration);
    const offer = await peer.createOffer(options);
    this.assertLifecycleGeneration(lifecycleGeneration);
    const preferredOffer = {
      ...offer,
      sdp: applyOpusReceiverPreferencesToSdp(offer.sdp),
    };
    await peer.setLocalDescription(preferredOffer);
    this.assertLifecycleGeneration(lifecycleGeneration);
    await this.options.api.sendSignalSoac({
      type,
      clientId: this.clientId,
      iceId: this.iceId,
      appControlId: this.appControlId,
      sdp: peer.localDescription?.sdp ?? preferredOffer.sdp,
      gzipSdp: this.gzipSdp,
      iceNetworkType: this.iceNetworkType,
    });
    this.assertLifecycleGeneration(lifecycleGeneration);
  }

  private async applySwitchNetworkNotify(payload: unknown, lifecycleGeneration: number): Promise<void> {
    const peer = this.peer;
    if (!peer || !this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
    const notify = normalizeSwitchNetworkNotify(payload, this.iceId);
    if (!notify) return;

    if (notify.transportType !== undefined) {
      this.iceNetworkType = notify.transportType;
    }
    console.warn(
      `[uurc] 收到切网通知 → 发起 ICE restart（transportType=${notify.transportType ?? "?"}），画面可能短暂停滞`,
    );
    peer.restartIce?.();
    this.recordDebugEvent("signal", "发起 ICE restart", {
      iceId: notify.iceId ?? this.iceId,
      transportType: notify.transportType,
    });
    await this.createAndSendLocalOffer("restart_ice", { iceRestart: true }, lifecycleGeneration);
  }

  private async flushQueuedCandidates(peer: BrowserRemotePeerConnection, lifecycleGeneration: number): Promise<void> {
    if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration) || !peer.remoteDescription) return;
    const candidates = this.queuedCandidates;
    this.queuedCandidates = [];
    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (error) {
        if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
        throw error;
      }
      if (!this.isPeerLifecycleCurrent(peer, lifecycleGeneration)) return;
      this.recordDebugEvent("signal", "应用缓存 candidate", {
        candidateType: candidate.candidate ? extractCandidateType(candidate.candidate) : undefined,
      });
    }
  }

  private applyRemoteTrack(event: RTCTrackEvent): void {
    const stream = this.remoteStream ?? createMediaStream() ?? event.streams[0];
    if (!stream) return;
    const tracks = typeof stream.getTracks === "function" ? stream.getTracks() : [];
    const existingTrack = tracks.some((track) => track.id && track.id === event.track.id);
    if (!existingTrack && typeof stream.addTrack === "function") {
      stream.addTrack(event.track);
    }
    this.remoteStream = stream;
    const nextTrackCount =
      typeof stream.getTracks === "function"
        ? stream.getTracks().length
        : this.state.remoteTrackCount + (existingTrack ? 0 : 1);
    this.setState({
      ...this.state,
      remoteTrackCount: nextTrackCount,
    });
    this.options.onRemoteStream?.(stream);
    this.recordDebugEvent("session", "收到远端媒体轨道", {
      trackId: event.track.id,
      trackKind: event.track.kind,
      remoteTrackCount: nextTrackCount,
    });
  }

  private startEchoHeartbeat(): void {
    if (this.echoHeartbeatTimer !== undefined) return;
    this.recordDebugEvent("data_channel", "启动控制心跳", {
      label: STREAMER_DATA_CHANNEL_LABELS.control,
      intervalMs: BrowserRemoteSession.echoHeartbeatIntervalMs,
    });
    this.sendEchoHeartbeat();
    this.echoHeartbeatTimer = setInterval(() => {
      this.sendEchoHeartbeat();
    }, BrowserRemoteSession.echoHeartbeatIntervalMs);
  }

  private stopEchoHeartbeat(): void {
    if (this.echoHeartbeatTimer !== undefined) {
      clearInterval(this.echoHeartbeatTimer);
      this.echoHeartbeatTimer = undefined;
    }
    this.lastEchoHeartbeatDebugAtMs = 0;
  }

  private sendEchoHeartbeat(): void {
    const label = STREAMER_DATA_CHANNEL_LABELS.control;
    const channel = this.dataChannels.get(label);
    if (!channel || channel.readyState !== "open") {
      this.stopEchoHeartbeat();
      return;
    }

    const sequence = this.sequence;
    const now = this.now();
    const payload = encodeStreamerEchoRequestMessage({
      sequence,
      timestampMs: this.streamerTimestampSeconds(),
    });
    this.sequence += 1;

    try {
      channel.send(payload);
    } catch (error) {
      this.recordDebugEvent("data_send", "控制心跳发送失败", {
        label,
        sequence,
        readyState: channel.readyState,
        error: getErrorMessage(error),
      });
      // 仅在通道确实不可用时停止心跳。瞬时背压（send 抛错但通道仍 open）不应永久杀死心跳，
      // 否则受控端会因连续收不到心跳而判定主控离线并停止推流，只能断开重连才恢复。
      if (channel.readyState !== "open") {
        this.stopEchoHeartbeat();
      }
      return;
    }

    if (
      this.lastEchoHeartbeatDebugAtMs === 0 ||
      now - this.lastEchoHeartbeatDebugAtMs >= BrowserRemoteSession.echoHeartbeatDebugIntervalMs
    ) {
      this.recordDebugEvent("data_send", "发送控制心跳", {
        label,
        byteLength: payload.byteLength,
        sequence,
        intervalMs: BrowserRemoteSession.echoHeartbeatIntervalMs,
      });
      this.lastEchoHeartbeatDebugAtMs = now || 1;
    }
  }

  private recordDataChannelMessage(label: StreamerDataChannelLabel, data: unknown): void {
    if (
      (label === STREAMER_DATA_CHANNEL_LABELS.file || label === STREAMER_DATA_CHANNEL_LABELS.text) &&
      this.clipboard.handleDataMessage(label, data)
    ) {
      return;
    }

    const decodedControlMessage =
      label === STREAMER_DATA_CHANNEL_LABELS.control ? this.decodeControlDataChannelMessage(data) : undefined;
    if (decodedControlMessage) this.handleControlDataMessage(decodedControlMessage);

    const now = this.now();
    const lastDebugAtMs = this.lastDataReceiveDebugAtMs.get(label) ?? 0;
    if (lastDebugAtMs > 0 && now - lastDebugAtMs < BrowserRemoteSession.dataReceiveDebugIntervalMs) return;

    this.lastDataReceiveDebugAtMs.set(label, now || 1);
    this.recordDebugEvent("data_recv", `收到 ${label} 数据`, {
      label,
      ...summarizeDataChannelPayload(data, {
        includeHexPrefix: label !== STREAMER_DATA_CHANNEL_LABELS.file && label !== STREAMER_DATA_CHANNEL_LABELS.text,
      }),
      decoded: decodedControlMessage ? summarizeDecodedControlMessage(decodedControlMessage) : undefined,
    });
  }

  private receiveDataChannelMessage(label: StreamerDataChannelLabel, data: unknown, lifecycleGeneration: number): void {
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      void data
        .arrayBuffer()
        .then((buffer) => {
          if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
          this.recordDataChannelMessage(label, buffer);
        })
        .catch((error: unknown) => {
          if (!this.isLifecycleGenerationCurrent(lifecycleGeneration)) return;
          this.recordDebugEvent("data_recv", "读取 DataChannel Blob 失败", {
            label,
            payloadType: "blob",
            byteLength: data.size,
            error: getErrorMessage(error),
          });
        });
      return;
    }
    this.recordDataChannelMessage(label, data);
  }

  private decodeControlDataChannelMessage(data: unknown): DecodedStreamerControlMessage | undefined {
    const bytes = dataChannelPayloadBytes(data);
    if (!bytes) return undefined;
    try {
      return decodeStreamerControlMessage(bytes);
    } catch (error) {
      this.recordDebugEvent("data_recv", "控制数据解码失败", {
        error: getErrorMessage(error),
        ...summarizeDataChannelPayload(data),
      });
      return undefined;
    }
  }

  private handleControlDataMessage(message: DecodedStreamerControlMessage): void {
    this.applyCaptureChangeInputIndex(message);
    this.applyRemoteCursorShape(message);

    const simpleAction = message.simpleAction;
    if (!simpleAction || simpleAction.action !== STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) return;
    const responseSequence = simpleAction.seq ?? message.sequence;
    if (responseSequence === undefined) {
      this.recordDebugEvent("data_recv", "收到控制 EchoRequest 但缺少 seq", summarizeDecodedControlMessage(message));
      return;
    }

    this.sendEchoResponse(responseSequence);
  }

  private applyRemoteCursorShape(message: DecodedStreamerControlMessage): void {
    const cursorShape = message.systemStateChange?.cursorShape;
    if (!cursorShape) return;
    if (
      cursorShape.screenId !== undefined &&
      this.remoteInputDisplayId !== undefined &&
      cursorShape.screenId !== this.remoteInputDisplayId
    ) {
      this.recordDebugEvent("data_recv", "忽略非当前画面的光标形状", {
        cursorScreenId: cursorShape.screenId,
        inputDisplayId: this.remoteInputDisplayId,
      });
      return;
    }
    this.recordDebugEvent("data_recv", "更新远端光标形状", summarizeCursorShape(cursorShape));
    this.options.onRemoteCursorShape?.(cursorShape);
  }

  private applyCaptureChangeInputIndex(message: DecodedStreamerControlMessage): void {
    const captureChange = message.captureChange;
    if (!captureChange) return;

    const nextInputDisplayId =
      captureChange.captureTypeName === "CT_MUMU" && captureChange.captureId !== undefined
        ? captureChange.captureId
        : undefined;
    if (nextInputDisplayId === this.remoteInputDisplayId) return;

    this.remoteInputDisplayId = nextInputDisplayId;
    this.options.onRemoteCursorShape?.(null);
    this.setState({
      ...this.state,
      remoteInputDisplayId: nextInputDisplayId,
    });
    this.recordDebugEvent("data_recv", "更新控制输入索引", {
      inputDisplayId: nextInputDisplayId,
      captureChange,
    });
  }

  private sendEchoResponse(responseSequence: number): void {
    const label = STREAMER_DATA_CHANNEL_LABELS.control;
    const channel = this.dataChannels.get(label);
    if (!channel || channel.readyState !== "open") return;

    const sequence = this.sequence;
    const timestampSeconds = this.streamerTimestampSeconds();
    const payload = encodeStreamerEchoResponseMessage({
      sequence,
      timestampMs: timestampSeconds,
      responseSequence,
    });
    this.sequence += 1;

    this.sendDataChannel(label, payload, {
      summary: "回复控制 EchoRequest",
      details: {
        sequence,
        timestampSeconds,
        responseSequence,
      },
    });
  }

  private sendDataChannel(
    label: StreamerDataChannelLabel,
    payload: string | Uint8Array,
    event:
      | {
          summary: string;
          details?: Record<string, unknown>;
        }
      | false
      | undefined = undefined,
  ): void {
    const channel = this.dataChannels.get(label);
    if (!channel) throw new Error(`${label} has not been created`);
    if (channel.readyState !== "open") throw new Error(`${label} is ${channel.readyState}, not open`);
    channel.send(payload);
    if (event !== false) {
      this.recordDebugEvent("data_send", event?.summary ?? `发送 ${label}`, {
        label,
        byteLength: dataChannelPayloadByteLength(payload),
        frameType: typeof payload === "string" ? "text" : "binary",
        ...(event?.details ?? {}),
      });
    }
    this.updateDataChannelState(label);
  }

  private sendInputData(inputMessage: string, options: { recordDebugEvent?: boolean } = {}): void {
    if (!inputMessage) {
      this.recordDebugEvent("data_send", "跳过空控制输入", {
        targetPlatform: this.targetPlatform,
      });
      return;
    }
    const sequence = this.sequence;
    const timestampSeconds = this.streamerTimestampSeconds();
    const inputDisplayId = this.resolveInputDisplayId();
    const payload = isDesktopPlatform(this.targetPlatform)
      ? inputMessage
      : encodeStreamerInputMessage({
          sequence,
          timestampMs: timestampSeconds,
          inputMessage,
          displayId: inputDisplayId,
        });
    this.sequence += 1;
    this.sendDataChannel(
      STREAMER_DATA_CHANNEL_LABELS.control,
      payload,
      options.recordDebugEvent === false
        ? false
        : {
            summary: "发送控制输入",
            details: {
              sequence,
              timestampSeconds,
              inputDisplayId,
              remoteDisplayId: this.remoteDisplayId,
              route: isDesktopPlatform(this.targetPlatform) ? "control_text" : "send_to_rom",
              targetPlatform: this.targetPlatform,
              input: summarizeInputMessage(inputMessage),
            },
          },
    );
  }

  private resolveInputDisplayId(): number | undefined {
    if (this.remoteInputDisplayId !== undefined) return this.remoteInputDisplayId;
    return this.remoteDisplayId;
  }

  private isLifecycleGenerationCurrent(generation: number): boolean {
    return this.lifecycleGeneration === generation;
  }

  private isPeerLifecycleCurrent(peer: BrowserRemotePeerConnection, generation: number): boolean {
    return this.peer === peer && this.isLifecycleGenerationCurrent(generation);
  }

  private assertLifecycleGeneration(generation: number): void {
    if (this.isLifecycleGenerationCurrent(generation)) return;
    throw createAbortError("browser remote session start was superseded or closed");
  }

  private updateDataChannelState(label: StreamerDataChannelLabel): void {
    const channel = this.dataChannels.get(label);
    const nextReadyState = channel?.readyState ?? "closed";
    // 仅在通道状态真正变化时推送，避免每次发送（鼠标移动/心跳/输入）都触发整页重渲染。
    if (this.state.dataChannels[label] === nextReadyState) return;
    this.setState({
      ...this.state,
      dataChannels: {
        ...this.state.dataChannels,
        [label]: nextReadyState,
      },
    });
  }

  private getDataChannelStates(): Partial<Record<StreamerDataChannelLabel, RTCDataChannelState>> {
    const states: Partial<Record<StreamerDataChannelLabel, RTCDataChannelState>> = {};
    for (const [label, channel] of this.dataChannels) {
      states[label] = channel.readyState;
    }
    return states;
  }

  private setState(state: BrowserRemoteSessionState): void {
    this.state = {
      ...state,
      debugEvents: this.debugEvents,
    };
    this.options.onStateChange?.(this.getState());
  }

  private recordDebugEvent(
    kind: BrowserRemoteDebugEventKind,
    summary: string,
    details?: Record<string, unknown>,
  ): void {
    const event: BrowserRemoteDebugEvent = {
      id: this.debugEventId++,
      atMs: this.now(),
      kind,
      summary,
      details: details === undefined ? undefined : dropUndefinedFields(details),
    };
    this.debugEvents = [...this.debugEvents, event].slice(-BrowserRemoteSession.maxDebugEvents);
    this.state = {
      ...this.state,
      debugEvents: this.debugEvents,
    };
    // 注意：调试事件只追加到环形缓冲，不主动推送 React 状态。
    // 高频路径（鼠标移动、控制心跳、回复 EchoRequest、收数据、统计采样）会产生大量调试事件，
    // 若每条都触发 onStateChange 会引发整页重渲染，挤占主线程，进而拖慢/饿死 100ms 控制心跳，
    // 导致受控端判定主控离线而停止推流（“发起控制后画面卡死”）。
    // 真正影响 UI 的状态变化都会经由 setState 单独推送；调试列表会在下一次 setState 或 1.5s 轮询时刷新。
  }

  private applyRemoteDisplayCapability(event: RemoteSignalGatewayEvent): void {
    const displayId = extractRemoteDisplayId(event.payload);
    if (displayId === undefined || displayId === this.remoteDisplayId) return;
    this.remoteDisplayId = displayId;
    this.setState({
      ...this.state,
      remoteDisplayId: displayId,
    });
    this.recordDebugEvent("signal", "记录受控端显示器", { displayId });
  }
}
