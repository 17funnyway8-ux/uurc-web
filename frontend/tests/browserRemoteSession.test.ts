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
  STREAMER_CLIPBOARD_RESULTS,
  decodeStreamerClipboardTextChangeRequest,
  encodeStreamerClipboardTextChangeRequest,
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

describe("BrowserRemoteSession", () => {
  it("starts the app-compatible browser WebRTC offer flow from a signal control ack", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      getVideoCodecPreferences: () => [
        {
          mimeType: "video/H264",
          clockRate: 90000,
          sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        },
      ],
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: '{"control_id":"control-1","device_capability":{}}',
    });

    expect(api.controlCalls).toEqual([
      {
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: '{"control_id":"control-1","device_capability":{}}',
      },
    ]);
    expect(peer.configuration).toEqual({
      iceServers: [
        {
          urls: "turn:relay.example:3478?transport=udp",
          username: "turn-user",
          credential: "turn-pass",
        },
      ],
      iceTransportPolicy: "all",
    });
    expect(peer.transceivers).toEqual([
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "audio", direction: "recvonly" },
    ]);
    expect(peer.videoCodecPreferenceCalls).toHaveLength(5);
    expect(peer.videoCodecPreferenceCalls).toEqual(
      Array.from({ length: 5 }, () => [
        {
          mimeType: "video/H264",
          clockRate: 90000,
          sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        },
      ]),
    );
    expect(peer.dataChannels).toEqual([
      "CONTROL_DATA_CHANNEL",
      "TEXT_DATA_CHANNEL",
      "STREAMER_DATA_CHANNEL",
      "FILE_DATA_CHANNEL",
      "BINARY_DATA_CHANNEL",
    ]);
    expect(api.soacCalls).toEqual([
      {
        type: "offer",
        clientId: "controlled-1",
        iceId: "ice-1",
        appControlId: "control-1",
        sdp: "v=0 browser offer",
        gzipSdp: true,
        iceNetworkType: 3,
      },
    ]);
    peer.onicecandidate?.({
      candidate: {
        toJSON: () => ({ candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host", sdpMid: "0", sdpMLineIndex: 0 }),
      },
    } as RTCPeerConnectionIceEvent);
    await Promise.resolve();
    expect(api.soacCalls.at(-1)).toMatchObject({
      type: "candidate",
      clientId: "controlled-1",
      iceId: "ice-1",
      appControlId: "control-1",
      candidate: {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
      },
    });
    expect(api.soacCalls.at(-1)).not.toHaveProperty("iceNetworkType");
  });

  it("keeps a closed session idle when signal control resolves after close", async () => {
    const controlGate = deferred<void>();
    const api = new FakeRemoteApi();
    const originalSendSignalControl = api.sendSignalControl.bind(api);
    const sendSignalControl = vi.spyOn(api, "sendSignalControl").mockImplementation(async (input) => {
      await controlGate.promise;
      return originalSendSignalControl(input);
    });
    const createPeerConnection = vi.fn(() => new FakePeerConnection());
    const observedStages: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection,
      onStateChange: (state) => observedStages.push(state.stage),
    });

    const startPromise = session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    await vi.waitFor(() => expect(sendSignalControl).toHaveBeenCalledOnce());
    const rejection = expect(startPromise).rejects.toMatchObject({ name: "AbortError" });

    session.close();
    controlGate.resolve(undefined);
    await rejection;

    expect(createPeerConnection).not.toHaveBeenCalled();
    expect(api.soacCalls).toEqual([]);
    expect(session.getState().stage).toBe("idle");
    expect(observedStages).toEqual(["idle"]);
  });

  it("closes an in-flight peer and suppresses stale callbacks when close interrupts createOffer", async () => {
    const offer = deferred<RTCSessionDescriptionInit>();
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    peer.createOfferPromise = offer.promise;
    const observedStages: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      onStateChange: (state) => observedStages.push(state.stage),
    });

    const startPromise = session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    await vi.waitFor(() => expect(peer.createOfferCalls).toEqual([undefined]));
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    const staleOpenCallback = control.onopen;
    const rejection = expect(startPromise).rejects.toMatchObject({ name: "AbortError" });

    session.close();
    offer.resolve({ type: "offer", sdp: "v=0 stale browser offer" });
    await rejection;
    staleOpenCallback?.(new Event("open"));

    expect(peer.closed).toBe(true);
    expect(peer.onicecandidate).toBeNull();
    expect(peer.ontrack).toBeNull();
    expect([...peer.channels.values()].every((channel) => channel.closed)).toBe(true);
    expect(peer.localDescription).toBeNull();
    expect(api.soacCalls).toEqual([]);
    expect(session.getState().stage).toBe("idle");
    expect(observedStages.at(-1)).toBe("idle");
    expect(observedStages).not.toContain("offered");
  });

  it("does not restore connected state when close interrupts a remote answer", async () => {
    const remoteDescriptionGate = deferred<void>();
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    peer.setRemoteDescriptionPromise = remoteDescriptionGate.promise;
    const observedStages: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      onStateChange: (state) => observedStages.push(state.stage),
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const setRemoteDescription = vi.spyOn(peer, "setRemoteDescription");

    const applyingAnswer = session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 controlled answer" },
      }),
    ]);
    await vi.waitFor(() => expect(setRemoteDescription).toHaveBeenCalledOnce());

    session.close();
    remoteDescriptionGate.resolve(undefined);
    await expect(applyingAnswer).resolves.toBeUndefined();

    expect(session.getState().stage).toBe("idle");
    expect(observedStages.at(-1)).toBe("idle");
    expect(observedStages).not.toContain("connected");
  });

  it("keeps H264 RTX codec preferences so lossy relay links can negotiate retransmission", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    vi.stubGlobal("RTCRtpSender", {
      getCapabilities: () => ({
        codecs: [
          { mimeType: "video/VP8", clockRate: 90000 },
          { mimeType: "video/rtx", clockRate: 90000 },
          {
            mimeType: "video/H264",
            clockRate: 90000,
            sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
          },
        ],
      }),
    });
    try {
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

      expect(peer.videoCodecPreferenceCalls[0].map((codec) => codec.mimeType)).toEqual(["video/H264", "video/rtx"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops before creating WebRTC when signal control ack returns a nonzero ControlResult", async () => {
    const soacCalls: RemoteSignalSoacRequest[] = [];
    const api = {
      async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
        expect(input.appControlId).toBe("control-1");
        return {
          event: "control",
          ackStatus: "fail",
          ack: ["fail", { code: 100002, msg: "rejected" }],
          control: {
            ackStatus: "fail",
            result: {
              clientId: "controlled-1",
              iceId: "ice-1",
              code: 100002,
              msg: "rejected",
              iceServers: [],
            },
          },
          emittedAt: "2026-05-15T00:00:00.000Z",
          ackReceivedAt: "2026-05-15T00:00:00.100Z",
        };
      },
      async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
        soacCalls.push(input);
        return { event: "soac", payload: input, emittedAt: "2026-05-15T00:00:00.200Z" };
      },
    };
    let peerCreated = false;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => {
        peerCreated = true;
        return new FakePeerConnection();
      },
    });

    await expect(
      session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      }),
    ).rejects.toThrow("signal control ack failed: ack=fail code=100002 protocol=protocol_error_2022 msg=rejected");

    expect(peerCreated).toBe(false);
    expect(soacCalls).toHaveLength(0);
  });

  it("uses the control ack ICE id for SOAC even when a pre-control fallback id is present", async () => {
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
      iceId: "web-ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    expect(session.getState()).toMatchObject({
      iceId: "ice-1",
      controlResultIceId: "ice-1",
      controlIceIdMatch: false,
    });
    expect(api.soacCalls[0]).toMatchObject({
      type: "offer",
      iceId: "ice-1",
    });
  });

  it("queues inbound SOAC candidates until the answer is applied", async () => {
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

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          candidate: {
            candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          sdp: "v=0 controlled answer",
        },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    expect(peer.candidates).toEqual([
      {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    ]);
  });

  it("ignores inbound SOAC answers that do not belong to the current App control session", async () => {
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
      iceId: "ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-2",
        data: {
          type: "answer",
          app_control_id: "control-2",
          ice_id: "ice-2",
          sdp: "v=0 stale answer",
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          app_control_id: "control-1",
          ice_id: "ice-1",
          sdp: "v=0 controlled answer",
        },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    expect(session.getState().stage).toBe("connected");
  });

  it("ignores inbound SOAC candidates scoped to another ICE connection", async () => {
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
      iceId: "ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          app_control_id: "control-1",
          ice_id: "ice-1",
          sdp: "v=0 controlled answer",
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          app_control_id: "control-1",
          ice_id: "ice-2",
          candidate: {
            candidate: "candidate:stale 1 udp 1 192.168.1.9 10001 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
      soacEvent(3, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          app_control_id: "control-1",
          ice_id: "ice-1",
          candidate: {
            candidate: "candidate:current 1 udp 1 192.168.1.2 10000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
    ]);

    expect(peer.candidates).toEqual([
      {
        candidate: "candidate:current 1 udp 1 192.168.1.2 10000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    ]);
  });

  it("does not reapply already processed SOAC events during polling", async () => {
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
    const events = [
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          sdp: "v=0 controlled answer",
        },
      }),
    ];

    await session.applySignalEvents(events);
    await session.applySignalEvents(events);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
  });

  it("applies inbound SOAC restart_ice as an App remote answer", async () => {
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
      gzipSdp: false,
    });

    await session.applySignalEvents([
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "restart_ice",
          sdp: "v=0 controlled restart answer",
          ice_network_type: STREAMER_ICE_NETWORK_TYPES.v4Wlan,
        },
      }),
    ]);

    expect(peer.restartIceCalls).toBe(0);
    expect(peer.createOfferCalls).toEqual([undefined]);
    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled restart answer" }]);
    expect(api.soacCalls).toHaveLength(1);
    expect(session.getState().stage).toBe("connected");
  });

  it("ignores stale SOAC answers when the peer is no longer in have-local-offer", async () => {
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

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 controlled answer" },
      }),
    ]);
    expect(peer.signalingState).toBe("stable");

    await session.applySignalEvents([
      soacEvent(2, {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 stale controlled answer" },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    const debugEvents = session.getState().debugEvents;
    expect(
      debugEvents.some((event) => event.kind === "signal" && event.summary === "忽略状态不匹配的 SOAC answer"),
    ).toBe(true);
  });

  it("records a debug event when setRemoteDescription rejects instead of throwing", async () => {
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

    peer.setRemoteDescriptionShouldThrow = true;

    await expect(
      session.applySignalEvents([
        soacEvent(1, {
          client_id: "controlled-1",
          data: { type: "answer", sdp: "v=0 controlled answer" },
        }),
      ]),
    ).resolves.toBeUndefined();

    expect(peer.remoteDescriptions).toEqual([]);
    expect(session.getState().stage).not.toBe("connected");
    const debugEvents = session.getState().debugEvents;
    expect(debugEvents.some((event) => event.kind === "signal" && event.summary === "应用 SOAC answer 失败")).toBe(
      true,
    );
  });

  it("handles App switch_network_notify by sending one restart_ice offer for the same ICE connection", async () => {
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

    const events = [
      {
        id: 10,
        direction: "inbound",
        event: "switch_network_notify",
        receivedAt: "2026-05-15T00:00:01.000Z",
        payload: [{ transport_type: STREAMER_ICE_NETWORK_TYPES.appAuto, attempt_switch_type: 2, ice_id: "ice-1" }],
      } satisfies RemoteSignalGatewayEvent,
    ];

    await session.applySignalEvents(events);
    await session.applySignalEvents(events);

    expect(peer.restartIceCalls).toBe(1);
    expect(peer.createOfferCalls).toEqual([undefined, { iceRestart: true }]);
    expect(api.soacCalls.at(-1)).toMatchObject({
      type: "restart_ice",
      clientId: "controlled-1",
      iceId: "ice-1",
      appControlId: "control-1",
      sdp: "v=0 browser restart offer",
      gzipSdp: true,
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
    });
  });

  it("can send a plain-SDP offer for streamer compatibility testing", async () => {
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
      gzipSdp: false,
    });

    expect(api.controlCalls).toEqual([
      {
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      },
    ]);
    expect(api.soacCalls[0]).toMatchObject({
      type: "offer",
      sdp: "v=0 browser offer",
      gzipSdp: false,
    });
  });

  it("can force the browser WebRTC path through relay candidates", async () => {
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
      forceRelay: true,
    });

    expect(peer.configuration).toMatchObject({
      iceTransportPolicy: "relay",
    });
  });

  it("keeps automatic browser ICE gathering open when the signal service recommends relay", async () => {
    const api = new FakeRemoteApi({
      forceRelay: true,
    });
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

    expect(peer.configuration).toMatchObject({
      iceTransportPolicy: "all",
    });
    expect(session.getState().controlResult?.forceRelay).toBe(true);
  });

  it("still lets the operator explicitly force relay candidates", async () => {
    const api = new FakeRemoteApi({
      forceRelay: true,
    });
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
      forceRelay: true,
    });

    expect(peer.configuration).toMatchObject({
      iceTransportPolicy: "relay",
    });
  });

  it("publishes remote media streams and sends text data on the App text channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let remoteStream: MediaStream | null = null;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 1234,
      onRemoteStream: (stream) => {
        remoteStream = stream;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const stream = { id: "stream-1" } as MediaStream;
    peer.ontrack?.({ streams: [stream], track: {} } as RTCTrackEvent);
    session.sendTextData(" hello ");

    expect(remoteStream).toBe(stream);
    expect(session.getState().remoteTrackCount).toBe(1);
    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.text)?.sent).toEqual([
      encodeStreamerTextMessage({
        sequence: 1,
        timestampMs: 1,
        inputMessage: "hello",
      }),
    ]);
  });

  it("sends Clipboard v3 text unchanged and resolves only after the matching success response", async () => {
    const { session, textChannel } = await startClipboardSession({ now: () => 1234 });
    const clipboardText = "  first line\n\u7b2c\u4e8c\u884c \ud83d\udc4b\n";

    const send = session.sendClipboardText(clipboardText);
    await flushMicrotasks();

    expect(textChannel.sent).toHaveLength(1);
    const request = decodeStreamerClipboardTextChangeRequest(textChannel.sent[0] as Uint8Array);
    expect(request).toEqual({
      type: "text-change-request",
      sequence: 1n,
      timestampMs: 1n,
      requestId: 1n,
      formatId: 1,
      text: clipboardText,
    });

    let settled = false;
    void send.then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    textChannel.emitMessage(clipboardTextChangeResponse(1n, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer);
    await expect(send).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it("preserves empty, whitespace-only, and Unicode clipboard values", async () => {
    const { session, textChannel } = await startClipboardSession();
    const values = ["", " \n\t ", "\u526a\u8d34\u677f \ud83d\udc4b"];

    for (const [index, value] of values.entries()) {
      const send = session.sendClipboardText(value);
      await flushMicrotasks();
      const request = decodeStreamerClipboardTextChangeRequest(textChannel.sent[index] as Uint8Array);
      expect(request?.text).toBe(value);
      textChannel.emitMessage(
        clipboardTextChangeResponse(request!.requestId, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer,
      );
      await expect(send).resolves.toBeUndefined();
    }
  });

  it("rejects failed and unspecified clipboard responses and retries the same text", async () => {
    const { session, textChannel } = await startClipboardSession();
    const firstSend = session.sendClipboardText("retry me");
    await flushMicrotasks();
    const firstRequest = decodeStreamerClipboardTextChangeRequest(textChannel.sent[0] as Uint8Array)!;

    textChannel.emitMessage(
      clipboardTextChangeResponse(firstRequest.requestId, STREAMER_CLIPBOARD_RESULTS.failed).buffer,
    );
    await expect(firstSend).rejects.toThrow("\u8fdc\u7aef\u62d2\u7edd\u66f4\u65b0\u526a\u8d34\u677f");

    const retry = session.sendClipboardText("retry me");
    await flushMicrotasks();
    const retryRequest = decodeStreamerClipboardTextChangeRequest(textChannel.sent[1] as Uint8Array)!;
    expect(retryRequest.requestId).not.toBe(firstRequest.requestId);
    expect(retryRequest.text).toBe("retry me");

    textChannel.emitMessage(
      clipboardTextChangeResponse(retryRequest.requestId, STREAMER_CLIPBOARD_RESULTS.unspecified).buffer,
    );
    await expect(retry).rejects.toThrow("\u8fdc\u7aef\u672a\u786e\u8ba4\u526a\u8d34\u677f\u66f4\u65b0");
  });

  it("ignores unknown responses while keeping the matching clipboard request pending", async () => {
    const { session, textChannel } = await startClipboardSession();
    const send = session.sendClipboardText("match by request id");
    await flushMicrotasks();
    const request = decodeStreamerClipboardTextChangeRequest(textChannel.sent[0] as Uint8Array)!;
    let settled = false;
    void send.finally(() => {
      settled = true;
    });

    textChannel.emitMessage(
      clipboardTextChangeResponse(request.requestId + 50n, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer,
    );
    await flushMicrotasks();
    expect(settled).toBe(false);

    textChannel.emitMessage(
      clipboardTextChangeResponse(request.requestId, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer,
    );
    await expect(send).resolves.toBeUndefined();
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: "\u5ffd\u7565\u672a\u77e5\u6216\u5df2\u8fc7\u671f\u7684\u526a\u8d34\u677f\u54cd\u5e94",
        }),
      ]),
    );
  });

  it("times out Clipboard v3 after five seconds, ignores the late response, and permits a retry", async () => {
    vi.useFakeTimers();
    try {
      const { session, textChannel } = await startClipboardSession();
      const send = session.sendClipboardText("slow clipboard");
      await flushMicrotasks();
      const request = decodeStreamerClipboardTextChangeRequest(textChannel.sent[0] as Uint8Array)!;
      const rejection = expect(send).rejects.toThrow(
        "\u7b49\u5f85\u8fdc\u7aef\u786e\u8ba4\u526a\u8d34\u677f\u66f4\u65b0\u8d85\u65f6",
      );

      await vi.advanceTimersByTimeAsync(4999);
      expect(textChannel.sent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;

      textChannel.emitMessage(
        clipboardTextChangeResponse(request.requestId, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer,
      );
      const retry = session.sendClipboardText("slow clipboard");
      await flushMicrotasks();
      const retryRequest = decodeStreamerClipboardTextChangeRequest(textChannel.sent[1] as Uint8Array)!;
      expect(retryRequest.requestId).not.toBe(request.requestId);
      textChannel.emitMessage(
        clipboardTextChangeResponse(retryRequest.requestId, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer,
      );
      await expect(retry).resolves.toBeUndefined();
      session.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers remote clipboard notifications once and suppresses pending and completed echoes", async () => {
    const received: string[] = [];
    const { session, textChannel } = await startClipboardSession({
      onRemoteClipboard: (text) => received.push(text),
    });
    const remoteText = " remote \n\u526a\u8d34\u677f ";

    textChannel.emitMessage(clipboardTextChangeNotification(40, 41, remoteText).buffer);
    textChannel.emitMessage(clipboardTextChangeNotification(41, 42, remoteText).buffer);
    expect(received).toEqual([remoteText]);

    const localText = "local echo";
    const send = session.sendClipboardText(localText);
    await flushMicrotasks();
    const request = decodeStreamerClipboardTextChangeRequest(textChannel.sent[0] as Uint8Array)!;
    textChannel.emitMessage(clipboardTextChangeNotification(42, 43, localText).buffer);
    expect(received).toEqual([remoteText]);

    textChannel.emitMessage(
      clipboardTextChangeResponse(request.requestId, STREAMER_CLIPBOARD_RESULTS.succeeded).buffer,
    );
    await send;
    textChannel.emitMessage(clipboardTextChangeNotification(43, 44, localText).buffer);
    expect(received).toEqual([remoteText]);

    textChannel.emitMessage(clipboardTextChangeNotification(44, 45, "").buffer);
    expect(received).toEqual([remoteText, ""]);
  });

  it("rejects pending clipboard RPCs when the session or text channel closes", async () => {
    const first = await startClipboardSession();
    const sessionSend = first.session.sendClipboardText("close session");
    await flushMicrotasks();
    const sessionRejection = expect(sessionSend).rejects.toMatchObject({ name: "AbortError" });
    first.session.close();
    await sessionRejection;

    const second = await startClipboardSession();
    const channelSend = second.session.sendClipboardText("close channel");
    await flushMicrotasks();
    const channelRejection = expect(channelSend).rejects.toMatchObject({ name: "AbortError" });
    second.textChannel.close();
    await channelRejection;
  });

  it("keeps clipboard text and encoded payload prefixes out of debug events", async () => {
    const secret = "clipboard-secret-\u526a\u8d34\u677f";
    const { session, textChannel } = await startClipboardSession();
    textChannel.emitMessage(clipboardTextChangeNotification(50, 51, secret).buffer);
    textChannel.emitMessage(new TextEncoder().encode(`malformed-${secret}`).buffer);

    const events = session.getState().debugEvents;
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(secret);
    expect(
      events.some((event) => event.kind === "data_recv" && event.details && Object.hasOwn(event.details, "hexPrefix")),
    ).toBe(false);
  });

  it("sends desktop mouse input on the App control channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendMouseClick({ absX: 320, absY: 240, button: "primary" });
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 320, absY: 240 }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 2,
        inputMessage: buildStreamerMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "data_send",
          summary: "发送控制输入",
          details: expect.objectContaining({
            label: STREAMER_DATA_CHANNEL_LABELS.control,
            sequence: 4,
            input: {
              action: "mouse_scroll",
              delta_x: 0,
              delta_y: -120,
            },
          }),
        }),
      ]),
    );
    expect(
      session
        .getState()
        .debugEvents.some((event) => event.details?.input && event.details.input.action === "mouse_move_absolute"),
    ).toBe(false);
  });

  it("starts the App echo heartbeat on the control data channel and stops it when closed", async () => {
    vi.useFakeTimers();
    try {
      const api = new FakeRemoteApi();
      const peer = new FakePeerConnection();
      let now = 4100;
      const session = new BrowserRemoteSession({
        api,
        createPeerConnection: (configuration) => {
          peer.configuration = configuration;
          return peer;
        },
        now: () => now,
      });
      await session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      });

      const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
      control?.onopen?.(new Event("open"));

      expect(control?.sent).toEqual([
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 4,
        }),
      ]);

      now = 4200;
      vi.advanceTimersByTime(100);

      expect(control?.sent).toEqual([
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 4,
        }),
        encodeStreamerEchoRequestMessage({
          sequence: 2,
          timestampMs: 4,
        }),
      ]);

      control?.close();
      now = 4500;
      vi.advanceTimersByTime(500);

      expect(control?.sent).toHaveLength(2);
      expect(session.getState().debugEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "data_send",
            summary: "发送控制心跳",
            details: expect.objectContaining({
              label: STREAMER_DATA_CHANNEL_LABELS.control,
              sequence: 1,
              intervalMs: 100,
            }),
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops only mouse-move frames while the control channel is backpressured", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      now: () => 6000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseButton({ action: "mousePress", button: "primary" });

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 6,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ summary: "控制通道拥塞，跳过鼠标移动" })]),
    );
  });

  it("keeps only the latest backpressured move and sends it at the low watermark", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseMove({ absX: 520, absY: 340 });
    expect(control.sent).toEqual([]);

    control.bufferedAmount = control.bufferedAmountLowThreshold;
    control.emitBufferedAmountLow();
    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
    ]);
  });

  it("sends a critical pointer position even while the control channel is backpressured", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseMove({ absX: 360, absY: 240 }, { critical: true });
    control.bufferedAmount = 0;
    control.emitBufferedAmountLow();

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 360, absY: 240 }),
      }),
    ]);
  });

  it("retries a failed critical pointer position before sending a mouse button", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseMove({ absX: 360, absY: 240 }, { critical: true })).toThrow("send failed");
    session.sendMouseButton({ action: "mousePress", button: "primary" });

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 360, absY: 240 }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 6,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
    ]);
  });

  it("does not let a mouse button overtake a critical pointer position that still cannot be sent", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 2;

    expect(() => session.sendMouseMove({ absX: 360, absY: 240 }, { critical: true })).toThrow("send failed");
    expect(() => session.sendMouseButton({ action: "mousePress", button: "primary" })).toThrow("send failed");
    expect(control.sent).toEqual([]);
  });

  it("flushes a failed critical position before the latest ordinary move at the low watermark", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseMove({ absX: 120, absY: 80 }, { critical: true })).toThrow("send failed");
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;
    session.sendMouseMove({ absX: 520, absY: 340 });
    control.bufferedAmount = control.bufferedAmountLowThreshold;
    control.emitBufferedAmountLow();

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
    ]);
  });

  it("does not let an ordinary move overtake a failed critical position", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseMove({ absX: 120, absY: 80 }, { critical: true })).toThrow("send failed");
    session.sendMouseMove({ absX: 520, absY: 340 });
    control.emitBufferedAmountLow();

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
    ]);
  });

  it("does not retain a mouse press when its channel send fails", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseButton({ action: "mousePress", button: "primary" })).toThrow("send failed");
    session.releaseAllInputs();

    expect(control.sent).toEqual([]);
  });

  it("records throttled inbound data channel messages for control debugging", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let now = 5000;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => now,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    control?.emitMessage(new Uint8Array([1, 2, 3]).buffer);
    now = 6000;
    control?.emitMessage(new Uint8Array([4, 5]).buffer);
    now = 36000;
    control?.emitMessage("ok");

    const receiveEvents = session.getState().debugEvents.filter((event) => event.kind === "data_recv");
    expect(receiveEvents).toEqual([
      expect.objectContaining({
        summary: "收到 CONTROL_DATA_CHANNEL 数据",
        details: {
          label: STREAMER_DATA_CHANNEL_LABELS.control,
          payloadType: "arraybuffer",
          byteLength: 3,
          hexPrefix: "01 02 03",
          decoded: {
            topLevelTags: [],
          },
        },
      }),
      expect.objectContaining({
        summary: "收到 CONTROL_DATA_CHANNEL 数据",
        details: {
          label: STREAMER_DATA_CHANNEL_LABELS.control,
          payloadType: "string",
          charLength: 2,
        },
      }),
    ]);
  });

  it("publishes cursor shape changes without pushing session state", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const cursorShapes: Array<DecodedStreamerCursorShape | null> = [];
    const onStateChange = vi.fn();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      onRemoteCursorShape: (shape) => cursorShapes.push(shape),
      onStateChange,
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const stateChangeCount = onStateChange.mock.calls.length;
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;

    control.emitMessage(cursorShapeControlMessage(5).buffer);

    expect(cursorShapes).toEqual([
      {
        posX: 2,
        posY: 3,
        width: 16,
        height: 24,
        byteValue: new Uint8Array([1, 2, 3, 4]),
        cursorType: 9,
        screenId: 5,
      },
    ]);
    expect(onStateChange).toHaveBeenCalledTimes(stateChangeCount);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: "更新远端光标形状",
          details: expect.objectContaining({ imageByteLength: 4, screenId: 5 }),
        }),
      ]),
    );

    session.close();
    expect(cursorShapes.at(-1)).toBeNull();
    const cursorChangeCount = cursorShapes.length;
    control.emitMessage(cursorShapeControlMessage(5).buffer);
    expect(cursorShapes).toHaveLength(cursorChangeCount);
  });

  it("replies to App control EchoRequest messages like the desktop controller", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let now = 7000;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => now,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    now = 7100;
    control?.emitMessage(
      encodeStreamerEchoRequestMessage({
        sequence: 41,
        timestampMs: 7050,
      }).buffer,
    );

    expect(control?.sent).toEqual([
      encodeStreamerEchoResponseMessage({
        sequence: 1,
        timestampMs: 7,
        responseSequence: 41,
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "data_send",
          summary: "回复控制 EchoRequest",
          details: expect.objectContaining({
            label: STREAMER_DATA_CHANNEL_LABELS.control,
            sequence: 1,
            responseSequence: 41,
          }),
        }),
        expect.objectContaining({
          kind: "data_recv",
          summary: "收到 CONTROL_DATA_CHANNEL 数据",
          details: expect.objectContaining({
            decoded: expect.objectContaining({
              sequence: 41,
              simpleAction: expect.objectContaining({
                actionName: "ACTION_TYPE_ECHO_REQUEST",
                seq: 41,
              }),
            }),
          }),
        }),
      ]),
    );
  });

  it("sends pointer drag input as separate App mouse messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2500,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseButton({ action: "mousePress", button: "primary" });
    session.sendMouseMove({ absX: 520, absY: 340 });
    session.sendMouseButton({ action: "mouseRelease", button: "primary" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" }),
      }),
    ]);
  });

  it("transforms browser input through the Mac server keymap shape for Mac targets", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2600,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 4,
    });

    session.sendMouseMove({ absX: 384, absY: 1037, surfaceWidth: 1920, surfaceHeight: 1080 });
    session.sendKeyboardInput({ action: "keyboardPress", value: 59 });
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      buildStreamerMacMouseMoveAbsoluteInputMessage({
        absX: 384,
        absY: 1037,
        surfaceWidth: 1920,
        surfaceHeight: 1080,
      }),
      buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: 59 }),
      buildStreamerMacMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
    ]);
  });

  it("transforms browser input through the Windows server keymap shape for Windows targets", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2600,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 1,
    });

    session.sendMouseMove({ absX: 384, absY: 1037, surfaceWidth: 1920, surfaceHeight: 1080 });
    session.sendKeyboardInput({ action: "keyboardPress", value: 113 });
    session.sendTextInput("o");
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    // Windows 是桌面被控端:与 Mac 一样走「裸 JSON(非 protobuf)+ 归一化坐标」，键码换成 Windows VK；
    // 打字走 text_input(单字符上屏)。
    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      buildStreamerMacMouseMoveAbsoluteInputMessage({
        absX: 384,
        absY: 1037,
        surfaceWidth: 1920,
        surfaceHeight: 1080,
      }),
      buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 113 }),
      buildStreamerTextInputMessage("o"),
      buildStreamerMacMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
    ]);
  });

  it("sends desktop keyboard input on the App control channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });
    session.sendKeyboardInput({ action: "keyboardRelease", value: "A" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 3,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "A" }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 3,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardRelease", value: "A" }),
      }),
    ]);
  });

  it("uses app-compatible second timestamps for control input messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 1_778_857_057_890,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendKeyboardInput({ action: "keyboardPress", value: "F12" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 1_778_857_057,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "F12" }),
      }),
    ]);
  });

  it("uses device_capability display ids for desktop SendToRom input messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3200,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      {
        id: 20,
        direction: "inbound",
        event: "forward_setting",
        receivedAt: "2026-05-15T00:00:02.000Z",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "device_capability",
              device_capability: {
                display_info: [{ id: 1, fps: 75, type: 0, hdr: -1 }],
              },
            },
          },
        ],
      },
    ]);
    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });

    expect(session.getState().remoteDisplayId).toBe(1);
    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 3,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "A" }),
        displayId: 1,
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "signal",
          summary: "记录受控端显示器",
          details: {
            displayId: 1,
          },
        }),
        expect.objectContaining({
          kind: "data_send",
          summary: "发送控制输入",
          details: expect.objectContaining({
            remoteDisplayId: 1,
          }),
        }),
      ]),
    );
  });

  it("uses the Mac keymap raw control-string route", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3300,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 4,
    });

    await session.applySignalEvents([
      {
        id: 21,
        direction: "inbound",
        event: "device_capability",
        receivedAt: "2026-05-15T00:00:03.000Z",
        payload: {
          client_id: "controlled-1",
          data: {
            type: "device_capability",
            device_capability: {
              display_info: [{ id: 1, fps: 75, type: 0, hdr: -1 }],
            },
          },
        },
      },
    ]);
    session.sendKeyboardInput({ action: "keyboardPress", value: 29 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: 29 }),
    ]);
  });

  it("uses the MuMu capture_change id as the SendToRom input index", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3250,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    control?.emitMessage(
      new Uint8Array([0x08, 0x01, 0x10, 0x02, 0x42, 0x04, 0x08, STREAMER_CAPTURE_CHANGE_TYPES.CT_MUMU, 0x10, 0x05])
        .buffer,
    );
    session.sendMouseButton({ action: "mousePress", button: "primary" });

    expect(session.getState().remoteInputDisplayId).toBe(5);
    expect(control?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 3,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
        displayId: 5,
      }),
    ]);
  });

  it("closes peer and App data channels when the browser session is stopped", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const states: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      onStateChange: (state) => {
        states.push(state.stage);
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.close();

    expect(peer.closed).toBe(true);
    expect([...peer.channels.values()].every((channel) => channel.closed)).toBe(true);
    expect(session.getState()).toMatchObject({
      appControlId: "",
      connectionPath: "unknown",
      dataChannels: {},
      remoteTrackCount: 0,
      stage: "idle",
    });
    expect(states.at(-1)).toBe("idle");
  });

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
  it("releases all held mouse buttons and keys via releaseAllInputs", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 9000,
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    session.sendMouseButton({ action: "mousePress", button: "secondary" });
    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });
    control!.sent.length = 0;

    session.releaseAllInputs();

    expect(control?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 9,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "secondary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 9,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardRelease", value: "A" }),
      }),
    ]);

    control!.sent.length = 0;
    session.releaseAllInputs();
    expect(control?.sent).toEqual([]);
  });

  it("retries held mouse and keyboard releases after a channel send failure", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      now: () => 9000,
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    session.sendMouseButton({ action: "mousePress", button: "secondary" });
    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });
    control.sent.length = 0;
    control.failNextSendCount = 2;

    session.releaseAllInputs();
    expect(control.sent).toEqual([]);

    session.releaseAllInputs();
    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 5,
        timestampMs: 9,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "secondary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 6,
        timestampMs: 9,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardRelease", value: "A" }),
      }),
    ]);

    control.sent.length = 0;
    session.releaseAllInputs();
    expect(control.sent).toEqual([]);
  });
});

async function startClipboardSession(
  options: {
    now?: () => number;
    onRemoteClipboard?: (text: string) => void;
  } = {},
): Promise<{ session: BrowserRemoteSession; textChannel: FakeDataChannel }> {
  const api = new FakeRemoteApi();
  const peer = new FakePeerConnection();
  const session = new BrowserRemoteSession({
    api,
    createPeerConnection: () => peer,
    ...options,
  });
  await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
  return {
    session,
    textChannel: peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.text)!,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function clipboardTextChangeNotification(sequence: number, requestId: number, text: string): Uint8Array {
  return encodeStreamerClipboardTextChangeRequest({
    sequence,
    timestampMs: sequence + 1,
    requestId,
    text,
  });
}

function clipboardTextChangeResponse(requestId: bigint, result: number): Uint8Array {
  if (requestId < 0n || requestId > 0x7fn || result < 0 || result > 0x7f) {
    throw new RangeError("test Clipboard response fixture only supports one-byte varints");
  }
  return new Uint8Array([
    0x08,
    0x5b,
    0x10,
    0x5c,
    0xb2,
    0x01,
    0x08,
    0x0a,
    0x02,
    0x08,
    Number(requestId),
    0x32,
    0x02,
    0x08,
    result,
  ]);
}

function soacEvent(id: number, payload: unknown): RemoteSignalGatewayEvent {
  return {
    id,
    direction: "inbound",
    event: "soac",
    receivedAt: "2026-05-15T00:00:00.000Z",
    payload: [payload],
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function cursorShapeControlMessage(screenId: number): Uint8Array {
  const cursorShape = [
    0x08,
    0x02,
    0x10,
    0x03,
    0x18,
    0x10,
    0x20,
    0x18,
    0x2a,
    0x04,
    0x01,
    0x02,
    0x03,
    0x04,
    0x30,
    0x09,
    0x48,
    screenId,
  ];
  const systemStateChange = [0x12, cursorShape.length, ...cursorShape];
  return new Uint8Array([0x7a, systemStateChange.length, ...systemStateChange]);
}

function makeInboundVideoStats(input: {
  packetsReceived: number;
  bytesReceived: number;
  framesDecoded: number;
  framesReceived?: number;
  framesDropped?: number;
  keyFramesDecoded?: number;
  pliCount?: number;
  nackCount?: number;
  firCount?: number;
  freezeCount?: number;
}): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>([
    [
      "video-1",
      {
        id: "video-1",
        type: "inbound-rtp",
        kind: "video",
        packetsReceived: input.packetsReceived,
        bytesReceived: input.bytesReceived,
        framesDecoded: input.framesDecoded,
        framesReceived: input.framesReceived ?? input.framesDecoded,
        framesDropped: input.framesDropped,
        keyFramesDecoded: input.keyFramesDecoded,
        pliCount: input.pliCount,
        nackCount: input.nackCount,
        firCount: input.firCount,
        freezeCount: input.freezeCount,
        codecId: "codec-1",
        decoderImplementation: "VideoToolbox",
        timestamp: 123456,
      },
    ],
    [
      "codec-1",
      {
        id: "codec-1",
        type: "codec",
        mimeType: "video/H264",
        payloadType: 102,
        clockRate: 90000,
      },
    ],
    [
      "pair-1",
      {
        id: "pair-1",
        type: "candidate-pair",
        selected: true,
        state: "succeeded",
        localCandidateId: "local-1",
        remoteCandidateId: "remote-1",
        bytesReceived: input.bytesReceived,
        bytesSent: 2048,
      },
    ],
    ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host", address: "192.168.1.20" }],
    ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host", address: "192.168.1.30" }],
  ]);
}

class FakeRemoteApi {
  readonly controlCalls: RemoteSignalControlRequest[] = [];
  readonly soacCalls: RemoteSignalSoacRequest[] = [];

  constructor(
    private readonly controlResultOverrides: Partial<NonNullable<RemoteSignalControlResult["control"]["result"]>> = {},
  ) {}

  async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
    this.controlCalls.push(input);
    return {
      event: "control",
      ackStatus: "success",
      ack: [],
      control: {
        ackStatus: "success",
        result: {
          clientId: "controlled-1",
          iceId: "ice-1",
          iceServers: [
            {
              urls: "turn:relay.example:3478?transport=udp",
              username: "turn-user",
              credential: "turn-pass",
            },
          ],
          ...this.controlResultOverrides,
        },
      },
      emittedAt: "2026-05-15T00:00:00.000Z",
      ackReceivedAt: "2026-05-15T00:00:00.100Z",
    };
  }

  async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
    this.soacCalls.push(input);
    return {
      event: "soac",
      payload: input,
      emittedAt: "2026-05-15T00:00:00.200Z",
    };
  }
}

class FakePeerConnection {
  configuration: unknown;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  signalingState: RTCSignalingState = "stable";
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly transceivers: Array<{ kind: string; direction?: RTCRtpTransceiverDirection }> = [];
  readonly dataChannels: string[] = [];
  readonly videoCodecPreferenceCalls: RTCRtpCodecCapability[][] = [];
  readonly channels = new Map<string, FakeDataChannel>();
  readonly remoteDescriptions: RTCSessionDescriptionInit[] = [];
  readonly candidates: RTCIceCandidateInit[] = [];
  readonly createOfferCalls: Array<RTCOfferOptions | undefined> = [];
  createOfferPromise: Promise<RTCSessionDescriptionInit> | undefined;
  setRemoteDescriptionPromise: Promise<void> | undefined;
  setRemoteDescriptionShouldThrow = false;
  closed = false;
  restartIceCalls = 0;
  stats: Map<string, Record<string, unknown>> = new Map();

  createDataChannel(label: string): FakeDataChannel {
    this.dataChannels.push(label);
    const channel = new FakeDataChannel(label);
    this.channels.set(label, channel);
    return channel;
  }

  addTransceiver(kind: "audio" | "video", init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    this.transceivers.push({ kind, direction: init?.direction });
    return {
      setCodecPreferences: (codecs: RTCRtpCodecCapability[]) => {
        if (kind === "video") this.videoCodecPreferenceCalls.push(codecs);
      },
    } as RTCRtpTransceiver;
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls.push(options);
    if (this.createOfferPromise) return this.createOfferPromise;
    return {
      type: "offer",
      sdp: options?.iceRestart ? "v=0 browser restart offer" : "v=0 browser offer",
    };
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    if (description.type === "offer") {
      this.signalingState = "have-local-offer";
    } else if (description.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.setRemoteDescriptionPromise) await this.setRemoteDescriptionPromise;
    if (this.setRemoteDescriptionShouldThrow) {
      throw new Error("InvalidStateError: setRemoteDescription wrong state");
    }
    this.remoteDescription = description;
    this.remoteDescriptions.push(description);
    if (description.type === "answer") {
      this.signalingState = "stable";
    } else if (description.type === "offer") {
      this.signalingState = "have-remote-offer";
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.candidates.push(candidate);
  }

  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    return this.stats;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeDataChannel {
  binaryType: BinaryType = "arraybuffer";
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onbufferedamountlow: ((event: Event) => void) | null = null;
  readyState: RTCDataChannelState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readonly sent: Array<string | Blob | ArrayBuffer | ArrayBufferView> = [];
  failNextSendCount = 0;
  closed = false;

  constructor(readonly label: string) {}

  send(data: string | Blob | ArrayBuffer | ArrayBufferView): void {
    if (this.failNextSendCount > 0) {
      this.failNextSendCount -= 1;
      throw new Error("send failed");
    }
    this.sent.push(data);
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitBufferedAmountLow(): void {
    this.onbufferedamountlow?.(new Event("bufferedamountlow"));
  }

  close(): void {
    this.closed = true;
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}
