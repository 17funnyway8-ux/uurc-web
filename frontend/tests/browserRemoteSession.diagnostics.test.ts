import { describe, expect, it, vi } from "vitest";

import type {
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalGatewayEvent,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
} from "@uurc/shared/types";
import {
  STREAMER_CAPTURE_CHANGE_TYPES,
  encodeStreamerEchoResponseMessage,
  encodeStreamerEchoRequestMessage,
  encodeStreamerInputMessage,
  encodeStreamerTextMessage,
  type DecodedStreamerCursorShape,
} from "@uurc/shared/streamer/controlChannel";
import {
  STREAMER_CLIPBOARD_FORMAT_NAMES,
  STREAMER_CLIPBOARD_RESULTS,
  decodeStreamerClipboardV4Message,
  decodeStreamerClipboardTextChangeRequest,
  encodeStreamerClipboardFormatDataAskRequest,
} from "@uurc/shared/streamer/clipboard";
import {
  buildStreamerKeyboardInputMessage,
  buildStreamerMacKeyboardInputMessage,
  buildStreamerMacMouseMoveAbsoluteInputMessage,
  buildStreamerMacMouseScrollInputMessage,
  buildStreamerMouseButtonInputMessage,
  buildStreamerMouseMoveAbsoluteInputMessage,
  buildStreamerMouseScrollInputMessage,
  buildStreamerTextInputMessage,
  buildStreamerWindowsKeyboardInputMessage,
} from "@uurc/shared/streamer/input";
import { STREAMER_ICE_NETWORK_TYPES } from "@uurc/shared/streamer/signal";
import { STREAMER_DATA_CHANNEL_LABELS, STREAMER_MAX_DATA_BUFFER_BYTES } from "@uurc/shared/streamer/transport";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";
import {
  FakeDataChannel,
  FakePeerConnection,
  FakeRemoteApi,
  blobFromBytes,
  clipboardDataBlockRequest,
  cursorShapeControlMessage,
  deferred,
  encodeUtf8,
  flushMicrotasks,
  makeInboundVideoStats,
  soacEvent,
  startClipboardSession,
} from "./browserRemoteSessionTestHarness.js";

describe("BrowserRemoteSession", () => {
  it("classifies the active WebRTC path from selected relay candidate stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          selected: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      [
        "local-1",
        { id: "local-1", type: "local-candidate", candidateType: "relay", protocol: "udp", address: "203.0.113.10" },
      ],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "relay", address: "203.0.113.11" }],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().connectionPath).toBe("relay");
    expect(session.getState().selectedCandidatePair).toMatchObject({
      localCandidateType: "relay",
      remoteCandidateType: "relay",
      protocol: "udp",
    });
  });

  it("classifies private host candidate pairs as LAN", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          nominated: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host", address: "192.168.1.20" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host", address: "192.168.1.30" }],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().connectionPath).toBe("lan");
    expect(session.getState().selectedCandidatePair).toMatchObject({
      localAddress: "192.168.1.20",
      remoteAddress: "192.168.1.30",
    });
  });

  it("publishes inbound video RTP stats for freeze diagnostics", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "video-1",
        {
          id: "video-1",
          type: "inbound-rtp",
          kind: "video",
          packetsReceived: 120,
          bytesReceived: 98000,
          framesDecoded: 60,
          framesReceived: 66,
          framesDropped: 2,
          frameWidth: 2560,
          frameHeight: 1440,
          timestamp: 123456,
        },
      ],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().inboundVideo).toMatchObject({
      packetsReceived: 120,
      bytesReceived: 98000,
      framesDecoded: 60,
      framesReceived: 66,
      framesDropped: 2,
      frameWidth: 2560,
      frameHeight: 1440,
      timestampMs: 123456,
    });
  });

  it("publishes the active inbound audio RTP and Opus codec stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "audio-low",
        {
          id: "audio-low",
          type: "inbound-rtp",
          kind: "audio",
          bytesReceived: 100,
        },
      ],
      [
        "audio-active",
        {
          id: "audio-active",
          type: "inbound-rtp",
          mediaType: "audio",
          codecId: "opus-codec",
          packetsReceived: 240,
          packetsLost: 3,
          bytesReceived: 65536,
          jitter: 0.012,
          jitterBufferDelay: 1.2,
          jitterBufferEmittedCount: 120,
          totalSamplesReceived: 230400,
          concealedSamples: 960,
          silentConcealedSamples: 480,
          totalAudioEnergy: 8.5,
          audioLevel: 0.4,
          timestamp: 123456,
        },
      ],
      [
        "opus-codec",
        {
          id: "opus-codec",
          type: "codec",
          mimeType: "audio/opus",
          payloadType: 111,
          clockRate: 48000,
          channels: 2,
        },
      ],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().inboundAudio).toEqual({
      codecId: "opus-codec",
      codecMimeType: "audio/opus",
      codecPayloadType: 111,
      codecClockRate: 48000,
      codecChannels: 2,
      packetsReceived: 240,
      packetsLost: 3,
      bytesReceived: 65536,
      jitter: 0.012,
      jitterBufferDelay: 1.2,
      jitterBufferEmittedCount: 120,
      totalSamplesReceived: 230400,
      concealedSamples: 960,
      silentConcealedSamples: 480,
      totalAudioEnergy: 8.5,
      audioLevel: 0.4,
      timestampMs: 123456,
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "stats",
      details: {
        inboundAudio: {
          codecMimeType: "audio/opus",
          bytesReceived: 65536,
        },
      },
    });
  });

  it("diagnoses a decode-side stall when RTP bytes advance but decoded frames do not", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({ packetsReceived: 130, bytesReceived: 125000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "decode_stalled",
      title: "RTP 仍在收包，解码帧未增长",
      delta: {
        packetsReceived: 30,
        bytesReceived: 35000,
        framesDecoded: 0,
      },
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "stats",
      summary: "RTP 仍在收包，解码帧未增长",
    });
    expect(session.getState().inboundVideo).toMatchObject({
      codecMimeType: "video/H264",
      decoderImplementation: "VideoToolbox",
    });
  });

  it("records pli/nack/keyDecoded deltas alongside decode_stalled stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({
      packetsReceived: 100,
      bytesReceived: 90000,
      framesDecoded: 50,
      keyFramesDecoded: 1,
      pliCount: 0,
      nackCount: 0,
      framesDropped: 0,
    });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({
      packetsReceived: 130,
      bytesReceived: 125000,
      framesDecoded: 50,
      keyFramesDecoded: 1,
      pliCount: 3,
      nackCount: 7,
      framesDropped: 4,
    });
    await session.refreshConnectionStats();

    const flow = session.getState().videoFlow;
    expect(flow?.status).toBe("decode_stalled");
    expect(flow?.delta).toMatchObject({
      pliCount: 3,
      nackCount: 7,
      framesDropped: 4,
      keyFramesDecoded: 0,
    });
    expect(flow?.detail).toContain("pli +3");
    expect(flow?.detail).toContain("nack +7");
    expect(flow?.detail).toContain("dropped +4");
  });

  it("diagnoses a transport-side stall when neither RTP nor selected pair bytes advance", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "transport_stalled",
      title: "RTP 收包无增量",
      delta: {
        packetsReceived: 0,
        bytesReceived: 0,
        framesDecoded: 0,
      },
    });
  });

  it("records browser video element samples for playback diagnostics", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "playing",
      currentTimeMs: 1200,
      totalVideoFrames: 72,
      droppedVideoFrames: 1,
      readyState: 4,
      paused: false,
      ended: false,
      width: 1920,
      height: 1080,
    });

    expect(session.getState().videoElement).toMatchObject({
      event: "playing",
      currentTimeMs: 1200,
      totalVideoFrames: 72,
      width: 1920,
      height: 1080,
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "video_element",
      summary: "video playing",
    });
  });

  it("records audio autoplay failures and successful playback", async () => {
    const session = new BrowserRemoteSession({ api: new FakeRemoteApi() });

    session.recordAudioElementSample({
      event: "autoplay_blocked",
      currentTimeMs: 0,
      readyState: 1,
      paused: true,
      muted: false,
      volume: 1,
      autoplayBlocked: true,
      errorName: "NotAllowedError",
    });

    expect(session.getState().audioElement).toMatchObject({
      event: "autoplay_blocked",
      autoplayBlocked: true,
      errorName: "NotAllowedError",
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "audio_element",
      summary: "audio autoplay_blocked",
    });

    session.recordAudioElementSample({
      event: "playing",
      currentTimeMs: 240,
      readyState: 4,
      paused: false,
      muted: false,
      volume: 1,
    });
    expect(session.getState().audioElement).toMatchObject({
      event: "playing",
      currentTimeMs: 240,
      paused: false,
    });
  });

  it("keeps the active video element sample when inactive transceivers report blank elements", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 47,
      totalVideoFrames: 9,
      droppedVideoFrames: 4,
      readyState: 4,
      paused: false,
      ended: false,
      width: 2560,
      height: 1440,
    });
    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 1047,
      totalVideoFrames: 62,
      droppedVideoFrames: 4,
      readyState: 4,
      paused: false,
      ended: false,
      width: 2560,
      height: 1440,
    });
    const flowAfterActiveSample = session.getState().videoFlow;
    const eventCountAfterActiveSample = session.getState().debugEvents.length;
    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 0,
      totalVideoFrames: 0,
      droppedVideoFrames: 0,
      readyState: 0,
      paused: false,
      ended: false,
      width: 0,
      height: 0,
    });

    expect(session.getState().videoElement).toMatchObject({
      currentTimeMs: 1047,
      totalVideoFrames: 62,
      readyState: 4,
      width: 2560,
      height: 1440,
    });
    expect(session.getState().videoFlow).toEqual(flowAfterActiveSample);
    expect(session.getState().debugEvents).toHaveLength(eventCountAfterActiveSample);
  });
});
