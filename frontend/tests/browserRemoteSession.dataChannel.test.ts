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

});
