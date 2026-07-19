import { describe, expect, it } from "vitest";

import { STREAMER_CONTROL_DECODE_LIMITS } from "../src/streamer/internal/controlDecodeLimits.js";
import {
  STREAMER_CAPTURE_CHANGE_TYPES,
  STREAMER_CURSOR_SHAPE_WIRE_FIELDS,
  STREAMER_ROM_MESSAGE_TYPES,
  STREAMER_ROM_MESSAGE_WIRE_FIELDS,
  STREAMER_SEND_TO_ROM_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_TYPES,
  STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS,
  STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
  encodeStreamerControlStringMessage,
  encodeStreamerEchoRequestMessage,
  encodeStreamerEchoResponseMessage,
  encodeStreamerInputMessage,
  encodeStreamerTextMessage,
  decodeStreamerControlMessage,
} from "../src/streamer/controlChannel.js";

function encodeTestVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return new Uint8Array(bytes);
}

function concatTestBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function testVarintField(tag: number, value: number): Uint8Array {
  return concatTestBytes(encodeTestVarint(tag * 8), encodeTestVarint(value));
}

function testLengthDelimitedField(tag: number, payload: Uint8Array): Uint8Array {
  return concatTestBytes(encodeTestVarint(tag * 8 + 2), encodeTestVarint(payload.byteLength), payload);
}

function testFixed64Field(tag: number, payload: Uint8Array): Uint8Array {
  if (payload.byteLength !== 8) throw new RangeError("fixed64 test payload must contain 8 bytes");
  return concatTestBytes(encodeTestVarint(tag * 8 + 1), payload);
}

describe("streamer control channel", () => {
  it("captures SendToRom wire tags and encodes VINPUT control messages", () => {
    expect(STREAMER_SEND_TO_ROM_WIRE_FIELDS).toEqual({
      envelopeTag: 11,
      inputTypeTag: 1,
      inputMessageTag: 2,
      displayIdTag: 3,
    });
    expect(STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT).toBe(0);

    expect(
      Array.from(
        encodeStreamerInputMessage({
          sequence: 1,
          timestampMs: 2,
          displayId: 5,
          inputMessage: "abc",
        }),
      ),
    ).toEqual([0x08, 0x01, 0x10, 0x02, 0x5a, 0x07, 0x12, 0x03, 0x61, 0x62, 0x63, 0x18, 0x05]);
  });

  it("captures legacy RomMessage tags and encodes Mac keymap input as a raw control string", () => {
    expect(STREAMER_ROM_MESSAGE_WIRE_FIELDS).toEqual({
      envelopeTag: 10,
      nameTag: 1,
      valueTag: 2,
      displayIdTag: 3,
      byteValueTag: 4,
    });

    const payload = encodeStreamerControlStringMessage('{"action":"kbd_press","key":0}');

    expect(Array.from(payload)).toEqual([
      0x7b, 0x22, 0x61, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x22, 0x3a, 0x22, 0x6b, 0x62, 0x64, 0x5f, 0x70, 0x72, 0x65, 0x73,
      0x73, 0x22, 0x2c, 0x22, 0x6b, 0x65, 0x79, 0x22, 0x3a, 0x30, 0x7d,
    ]);
  });

  it("encodes text channel SendToRom messages with RomMsg_Text type", () => {
    expect(STREAMER_ROM_MESSAGE_TYPES.RomMsg_Text).toBe(1);
    expect(
      Array.from(
        encodeStreamerTextMessage({
          sequence: 1,
          timestampMs: 2,
          inputMessage: "hi",
        }),
      ),
    ).toEqual([0x08, 0x01, 0x10, 0x02, 0x5a, 0x06, 0x08, 0x01, 0x12, 0x02, 0x68, 0x69]);
  });

  it("encodes App SendEchoRequest simple action heartbeat messages", () => {
    expect(STREAMER_SIMPLE_ACTION_WIRE_FIELDS).toEqual({
      envelopeTag: 3,
      actionTag: 1,
      argsTag: 2,
      featureFlagTag: 4,
    });
    expect(STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST).toBe(0);
    expect(STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS).toEqual({
      useClipboard: 2,
      autoClipboard: 1,
      enableKeyMouse: 2,
      enableGamepad: 2,
      enableTouch: 2,
      enableIme: 2,
      enableDisplayControl: 3,
    });

    expect(
      Array.from(
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 2,
        }),
      ),
    ).toEqual([
      0x08, 0x01, 0x10, 0x02, 0x1a, 0x1b, 0x12, 0x09, 0x7b, 0x22, 0x73, 0x65, 0x71, 0x22, 0x3a, 0x31, 0x7d, 0x22, 0x0e,
      0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20, 0x02, 0x30, 0x02, 0x38, 0x02, 0x40, 0x03,
    ]);
  });

  it("encodes and decodes App simple-action echo messages", () => {
    const request = encodeStreamerEchoRequestMessage({
      sequence: 41,
      timestampMs: 4200,
    });
    expect(decodeStreamerControlMessage(request)).toEqual({
      sequence: 41,
      timestampMs: 4200,
      byteLength: request.byteLength,
      topLevelTags: [1, 2, 3],
      simpleAction: {
        action: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST,
        actionName: "ACTION_TYPE_ECHO_REQUEST",
        args: '{"seq":41}',
        seq: 41,
        featureFlags: STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
      },
    });

    expect(
      Array.from(
        encodeStreamerEchoResponseMessage({
          sequence: 7,
          timestampMs: 8,
          responseSequence: 99,
        }),
      ),
    ).toEqual([
      0x08, 0x07, 0x10, 0x08, 0x1a, 0x1e, 0x08, 0x01, 0x12, 0x0a, 0x7b, 0x22, 0x73, 0x65, 0x71, 0x22, 0x3a, 0x39, 0x39,
      0x7d, 0x22, 0x0e, 0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20, 0x02, 0x30, 0x02, 0x38, 0x02, 0x40, 0x03,
    ]);
    expect(
      decodeStreamerControlMessage(
        encodeStreamerEchoResponseMessage({
          sequence: 7,
          timestampMs: 8,
          responseSequence: 99,
        }),
      ).simpleAction,
    ).toEqual({
      action: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE,
      actionName: "ACTION_TYPE_ECHO_RESPONSE",
      args: '{"seq":99}',
      seq: 99,
      featureFlags: STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
    });
  });

  it("decodes App capture_change and SendToRom control envelopes", () => {
    const captureChange = new Uint8Array([
      0x08,
      0x01,
      0x10,
      0x02,
      0x42,
      0x0a,
      0x08,
      STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP,
      0x10,
      0x05,
      0x1a,
      0x04,
      0x6d,
      0x61,
      0x69,
      0x6e,
    ]);
    expect(decodeStreamerControlMessage(captureChange)).toEqual({
      sequence: 1,
      timestampMs: 2,
      byteLength: captureChange.byteLength,
      topLevelTags: [1, 2, 8],
      captureChange: {
        captureType: STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP,
        captureTypeName: "CT_DESKTOP",
        captureId: 5,
        desc: "main",
      },
    });

    expect(
      decodeStreamerControlMessage(
        encodeStreamerInputMessage({
          sequence: 3,
          timestampMs: 4,
          displayId: 6,
          inputMessage: '{"action":"mouse_press","button":1}',
        }),
      ).sendToRom,
    ).toEqual({
      inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT,
      inputTypeName: "RomMsg_VINPUT",
      inputMessage: '{"action":"mouse_press","button":1}',
      displayId: 6,
    });
  });

  it("decodes SystemStateChange cursor_shape with little-endian doubles and signed cursor_type", () => {
    expect(STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS).toEqual({
      envelopeTag: 15,
      cursorShapeTag: 2,
    });
    expect(STREAMER_CURSOR_SHAPE_WIRE_FIELDS).toEqual({
      posXTag: 1,
      posYTag: 2,
      widthTag: 3,
      heightTag: 4,
      byteValueTag: 5,
      cursorTypeTag: 6,
      coordinateXScaleTag: 7,
      coordinateYScaleTag: 8,
      screenIdTag: 9,
    });

    const cursorShape = [
      0x08, 0xc0, 0x02, 0x10, 0xf0, 0x01, 0x18, 0x10, 0x20, 0x18, 0x2a, 0x04, 0x01, 0x02, 0x03, 0x04, 0x30, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x39, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f, 0x41, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x3f, 0x48, 0x02,
    ];
    const systemStateChange = [0x12, cursorShape.length, ...cursorShape];
    const payload = new Uint8Array([
      0x08,
      0x07,
      0xf1,
      0x01,
      0x00,
      0x01,
      0x02,
      0x03,
      0x04,
      0x05,
      0x06,
      0x07,
      0x7a,
      systemStateChange.length,
      ...systemStateChange,
      0xfd,
      0x01,
      0x08,
      0x09,
      0x0a,
      0x0b,
      0x10,
      0x09,
    ]);

    expect(decodeStreamerControlMessage(payload)).toEqual({
      sequence: 7,
      timestampMs: 9,
      byteLength: payload.byteLength,
      topLevelTags: [1, 30, 15, 31, 2],
      systemStateChange: {
        cursorShape: {
          posX: 320,
          posY: 240,
          width: 16,
          height: 24,
          byteValue: new Uint8Array([1, 2, 3, 4]),
          cursorType: -1,
          coordinateXScale: 1.5,
          coordinateYScale: 0.75,
          screenId: 2,
        },
      },
    });
  });

  it("bounds control messages by total bytes without rejecting the exact limit", () => {
    const atLimit = new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes);
    atLimit.set(testVarintField(1, 7));

    expect(() => decodeStreamerControlMessage(atLimit)).not.toThrow();
    expect(decodeStreamerControlMessage(atLimit)).toEqual({
      sequence: 7,
      byteLength: STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes,
      topLevelTags: [1],
    });

    const overLimit = new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes + 1);
    overLimit.set(testVarintField(1, 7));
    expect(() => decodeStreamerControlMessage(overLimit)).not.toThrow();
    expect(decodeStreamerControlMessage(overLimit)).toBeUndefined();
  });

  it("bounds protobuf field counts independently at each message level", () => {
    const atLimit = concatTestBytes(
      ...Array.from({ length: STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage }, () => testVarintField(20, 0)),
    );
    expect(decodeStreamerControlMessage(atLimit)?.topLevelTags).toHaveLength(
      STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage,
    );

    const overLimit = concatTestBytes(atLimit, testVarintField(20, 0));
    expect(decodeStreamerControlMessage(overLimit)).toBeUndefined();

    const nestedCursorOverLimit = concatTestBytes(
      ...Array.from({ length: STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage + 1 }, () => testVarintField(20, 0)),
    );
    const nestedPayload = concatTestBytes(
      testVarintField(1, 9),
      testLengthDelimitedField(
        STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag,
        testLengthDelimitedField(STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.cursorShapeTag, nestedCursorOverLimit),
      ),
    );
    expect(decodeStreamerControlMessage(nestedPayload)).toEqual({
      sequence: 9,
      byteLength: nestedPayload.byteLength,
      topLevelTags: [1, STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag],
      systemStateChange: {},
    });
  });

  it("bounds length-delimited payloads while skipping accepted unknown fields", () => {
    const acceptedUnknownField = testLengthDelimitedField(
      20,
      new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxLengthDelimitedBytes),
    );
    const acceptedPayload = concatTestBytes(acceptedUnknownField, testVarintField(1, 42));
    expect(() => decodeStreamerControlMessage(acceptedPayload)).not.toThrow();
    expect(decodeStreamerControlMessage(acceptedPayload)).toEqual({
      sequence: 42,
      byteLength: acceptedPayload.byteLength,
      topLevelTags: [20, 1],
    });

    const rejectedPayload = testLengthDelimitedField(
      20,
      new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxLengthDelimitedBytes + 1),
    );
    expect(() => decodeStreamerControlMessage(rejectedPayload)).not.toThrow();
    expect(decodeStreamerControlMessage(rejectedPayload)).toBeUndefined();
  });

  it("keeps cursor metadata when an otherwise valid cursor image exceeds its dedicated limit", () => {
    const wrapCursorShape = (cursorShape: Uint8Array) =>
      testLengthDelimitedField(
        STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag,
        testLengthDelimitedField(STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.cursorShapeTag, cursorShape),
      );
    const cursorMetadata = concatTestBytes(
      testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.cursorTypeTag, 0x7f01),
      testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.screenIdTag, 3),
    );
    const acceptedImage = new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes);
    const acceptedCursor = concatTestBytes(
      testLengthDelimitedField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag, acceptedImage),
      cursorMetadata,
    );
    const acceptedShape = decodeStreamerControlMessage(wrapCursorShape(acceptedCursor))?.systemStateChange?.cursorShape;
    expect(acceptedShape?.byteValue).toBeDefined();
    expect(acceptedShape?.byteValue).not.toBe(acceptedImage);
    expect(acceptedShape?.byteValue?.byteLength).toBe(STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes);
    expect(acceptedShape).toMatchObject({ cursorType: 0x7f01, screenId: 3 });

    const rejectedCursor = concatTestBytes(
      testLengthDelimitedField(
        STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag,
        new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes + 1),
      ),
      cursorMetadata,
    );
    expect(decodeStreamerControlMessage(wrapCursorShape(rejectedCursor))?.systemStateChange?.cursorShape).toEqual({
      cursorType: 0x7f01,
      screenId: 3,
    });
  });

  it("ignores known protobuf fields encoded with the wrong wire type", () => {
    const wrapCursorShape = (cursorShape: Uint8Array) =>
      testLengthDelimitedField(
        STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag,
        testLengthDelimitedField(STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.cursorShapeTag, cursorShape),
      );
    const wrongScalePayload = wrapCursorShape(
      concatTestBytes(
        testLengthDelimitedField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.coordinateXScaleTag, new Uint8Array([0])),
        testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.screenIdTag, 5),
      ),
    );
    expect(() => decodeStreamerControlMessage(wrongScalePayload)).not.toThrow();
    expect(decodeStreamerControlMessage(wrongScalePayload)?.systemStateChange?.cursorShape).toEqual({ screenId: 5 });

    const wrongImagePayload = wrapCursorShape(
      concatTestBytes(
        testFixed64Field(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag, new Uint8Array(8).fill(1)),
        testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.cursorTypeTag, 0x7f01),
      ),
    );
    expect(decodeStreamerControlMessage(wrongImagePayload)?.systemStateChange?.cursorShape).toEqual({
      cursorType: 0x7f01,
    });

    const wrongRomByteValuePayload = testLengthDelimitedField(
      STREAMER_ROM_MESSAGE_WIRE_FIELDS.envelopeTag,
      concatTestBytes(
        testFixed64Field(STREAMER_ROM_MESSAGE_WIRE_FIELDS.byteValueTag, new Uint8Array(8)),
        testVarintField(STREAMER_ROM_MESSAGE_WIRE_FIELDS.displayIdTag, 2),
      ),
    );
    expect(decodeStreamerControlMessage(wrongRomByteValuePayload)?.romMessage).toEqual({ displayId: 2 });
  });

  it("keeps safely decoded protobuf fields when cursor data is malformed", () => {
    const partialCursor = [0x08, 0x2a, 0x10, 0x80];
    const partialSystemState = [0x12, partialCursor.length, ...partialCursor];
    const nestedMalformed = new Uint8Array([
      0x08,
      0x01,
      0x7a,
      partialSystemState.length,
      ...partialSystemState,
      0x10,
      0x02,
    ]);

    expect(() => decodeStreamerControlMessage(nestedMalformed)).not.toThrow();
    expect(decodeStreamerControlMessage(nestedMalformed)).toEqual({
      sequence: 1,
      timestampMs: 2,
      byteLength: nestedMalformed.byteLength,
      topLevelTags: [1, 15, 2],
      systemStateChange: { cursorShape: { posX: 42 } },
    });

    const truncatedFixed64 = new Uint8Array([0x08, 0x03, 0xf1, 0x01, 0x00, 0x01]);
    expect(() => decodeStreamerControlMessage(truncatedFixed64)).not.toThrow();
    expect(decodeStreamerControlMessage(truncatedFixed64)).toEqual({
      sequence: 3,
      byteLength: truncatedFixed64.byteLength,
      topLevelTags: [1],
    });

    const truncatedLengthDelimited = new Uint8Array([0x08, 0x04, 0x7a, 0x05, 0x12]);
    expect(() => decodeStreamerControlMessage(truncatedLengthDelimited)).not.toThrow();
    expect(decodeStreamerControlMessage(truncatedLengthDelimited)).toEqual({
      sequence: 4,
      byteLength: truncatedLengthDelimited.byteLength,
      topLevelTags: [1],
    });

    const unterminatedVarint = new Uint8Array([0x08, 0x05, 0x10, ...new Array<number>(10).fill(0x80)]);
    expect(() => decodeStreamerControlMessage(unterminatedVarint)).not.toThrow();
    expect(decodeStreamerControlMessage(unterminatedVarint)).toEqual({
      sequence: 5,
      byteLength: unterminatedVarint.byteLength,
      topLevelTags: [1],
    });

    const nonFiniteScaleCursor = [0x39, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x7f, 0x48, 0x03];
    const nonFiniteScaleState = [0x12, nonFiniteScaleCursor.length, ...nonFiniteScaleCursor];
    const nonFiniteScalePayload = new Uint8Array([0x7a, nonFiniteScaleState.length, ...nonFiniteScaleState]);
    expect(decodeStreamerControlMessage(nonFiniteScalePayload).systemStateChange).toEqual({
      cursorShape: { screenId: 3 },
    });
  });
});
