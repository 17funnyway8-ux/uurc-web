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
