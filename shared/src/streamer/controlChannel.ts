import {
  protobufWireType,
  protobufFixed64FieldBytes,
  protobufLengthDelimitedFieldBytes,
  pushInt32Field,
  pushMessageField,
  pushStringField,
  pushVarintField,
  readProtobufFields,
} from "./internal/protobufWire.js";
import { STREAMER_CONTROL_DECODE_LIMITS } from "./internal/controlDecodeLimits.js";
import { asRecord } from "./internal/unknown.js";

const textDecoder = new TextDecoder();

export const STREAMER_SEND_TO_ROM_WIRE_FIELDS = {
  envelopeTag: 11,
  inputTypeTag: 1,
  inputMessageTag: 2,
  displayIdTag: 3,
} as const;

export const STREAMER_ROM_MESSAGE_WIRE_FIELDS = {
  envelopeTag: 10,
  nameTag: 1,
  valueTag: 2,
  displayIdTag: 3,
  byteValueTag: 4,
} as const;

export const STREAMER_SIMPLE_ACTION_WIRE_FIELDS = {
  envelopeTag: 3,
  actionTag: 1,
  argsTag: 2,
  featureFlagTag: 4,
} as const;

export const STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS = {
  envelopeTag: 15,
  cursorShapeTag: 2,
} as const;

export const STREAMER_CURSOR_SHAPE_WIRE_FIELDS = {
  posXTag: 1,
  posYTag: 2,
  widthTag: 3,
  heightTag: 4,
  byteValueTag: 5,
  cursorTypeTag: 6,
  coordinateXScaleTag: 7,
  coordinateYScaleTag: 8,
  screenIdTag: 9,
} as const;

export const STREAMER_SIMPLE_ACTION_TYPES = {
  ACTION_TYPE_ECHO_REQUEST: 0,
  ACTION_TYPE_ECHO_RESPONSE: 1,
} as const;

export const STREAMER_ROM_MESSAGE_TYPES = {
  RomMsg_VINPUT: 0,
  RomMsg_Text: 1,
  RomMsg_Snapshot: 2,
  RomMsg_TabManage: 3,
  RomMsg_Rotation: 4,
  RomMsg_Volume: 5,
} as const;

export type StreamerRomMessageType = (typeof STREAMER_ROM_MESSAGE_TYPES)[keyof typeof STREAMER_ROM_MESSAGE_TYPES];

export const STREAMER_CAPTURE_CHANGE_TYPES = {
  CT_DESKTOP: 0,
  CT_WINDOW: 1,
  CT_MUMU: 2,
  CT_HOOK: 3,
  CT_NONE: 99,
} as const;

export interface EncodeStreamerRomMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  inputType: StreamerRomMessageType;
  inputMessage: string;
  displayId?: number;
}

export interface EncodeStreamerInputMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  inputMessage: string;
  displayId?: number;
}

export const STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS = [
  { tag: 1, name: "useClipboard" },
  { tag: 2, name: "autoClipboard" },
  { tag: 3, name: "enableKeyMouse" },
  { tag: 4, name: "enableGamepad" },
  { tag: 6, name: "enableTouch" },
  { tag: 7, name: "enableIme" },
  { tag: 8, name: "enableDisplayControl" },
] as const;

export type StreamerSimpleActionFeatureFlagName = (typeof STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS)[number]["name"];

export type StreamerSimpleActionFeatureFlagsInput = Partial<Record<StreamerSimpleActionFeatureFlagName, number>>;

export const STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS = {
  useClipboard: 2,
  autoClipboard: 1,
  enableKeyMouse: 2,
  enableGamepad: 2,
  enableTouch: 2,
  enableIme: 2,
  enableDisplayControl: 3,
} as const satisfies StreamerSimpleActionFeatureFlagsInput;

export interface EncodeStreamerEchoRequestMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput | null;
}

export interface EncodeStreamerEchoResponseMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  responseSequence: number | bigint;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput | null;
}

export interface DecodedStreamerSimpleAction {
  action: number;
  actionName?: string;
  args?: string;
  seq?: number;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput;
}

export interface DecodedStreamerCaptureChange {
  captureType: number;
  captureTypeName?: string;
  captureId?: number;
  desc?: string;
}

export interface DecodedStreamerSendToRom {
  inputType: number;
  inputTypeName?: string;
  inputMessage?: string;
  displayId?: number;
}

export interface DecodedStreamerRomMessage {
  name?: string;
  value?: string;
  displayId?: number;
  byteValueLength?: number;
}

export interface DecodedStreamerCursorShape {
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  byteValue?: Uint8Array;
  cursorType?: number;
  coordinateXScale?: number;
  coordinateYScale?: number;
  screenId?: number;
}

export interface DecodedStreamerSystemStateChange {
  cursorShape?: DecodedStreamerCursorShape;
}

export interface DecodedStreamerControlMessage {
  sequence?: number;
  timestampMs?: number;
  byteLength: number;
  topLevelTags: number[];
  simpleAction?: DecodedStreamerSimpleAction;
  captureChange?: DecodedStreamerCaptureChange;
  romMessage?: DecodedStreamerRomMessage;
  sendToRom?: DecodedStreamerSendToRom;
  systemStateChange?: DecodedStreamerSystemStateChange;
}

export function encodeStreamerRomMessage(input: EncodeStreamerRomMessageInput): Uint8Array {
  const romMessageBytes: number[] = [];
  if (input.inputType !== STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT) {
    pushVarintField(romMessageBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputTypeTag, input.inputType);
  }
  if (input.inputMessage !== "") {
    pushStringField(romMessageBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputMessageTag, input.inputMessage);
  }
  if (input.displayId) {
    pushVarintField(romMessageBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.displayIdTag, input.displayId);
  }

  const envelopeBytes: number[] = [];
  pushVarintField(envelopeBytes, 1, input.sequence);
  pushVarintField(envelopeBytes, 2, input.timestampMs);
  pushMessageField(envelopeBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.envelopeTag, new Uint8Array(romMessageBytes));
  return new Uint8Array(envelopeBytes);
}

export function encodeStreamerControlStringMessage(inputMessage: string): Uint8Array {
  return new TextEncoder().encode(inputMessage);
}

export function encodeStreamerEchoRequestMessage(input: EncodeStreamerEchoRequestMessageInput): Uint8Array {
  return encodeStreamerSimpleActionMessage({
    sequence: input.sequence,
    timestampMs: input.timestampMs,
    actionType: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST,
    args: `{"seq":${formatJsonNumber(input.sequence)}}`,
    featureFlags: input.featureFlags,
  });
}

export function encodeStreamerEchoResponseMessage(input: EncodeStreamerEchoResponseMessageInput): Uint8Array {
  return encodeStreamerSimpleActionMessage({
    sequence: input.sequence,
    timestampMs: input.timestampMs,
    actionType: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE,
    args: `{"seq":${formatJsonNumber(input.responseSequence)}}`,
    featureFlags: input.featureFlags,
  });
}

function encodeStreamerSimpleActionMessage(input: {
  sequence: number | bigint;
  timestampMs: number | bigint;
  actionType: number;
  args: string;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput | null;
}): Uint8Array {
  const actionBytes: number[] = [];
  if (input.actionType !== STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) {
    pushVarintField(actionBytes, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.actionTag, input.actionType);
  }
  pushStringField(actionBytes, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.argsTag, input.args);
  pushMessageField(
    actionBytes,
    STREAMER_SIMPLE_ACTION_WIRE_FIELDS.featureFlagTag,
    encodeStreamerSimpleActionFeatureFlags(input.featureFlags ?? STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS),
  );

  const envelopeBytes: number[] = [];
  pushVarintField(envelopeBytes, 1, input.sequence);
  pushVarintField(envelopeBytes, 2, input.timestampMs);
  pushMessageField(envelopeBytes, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.envelopeTag, new Uint8Array(actionBytes));
  return new Uint8Array(envelopeBytes);
}

export function decodeStreamerControlMessage(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerControlMessage | undefined {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.byteLength > STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes) return undefined;
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const decoded: DecodedStreamerControlMessage = {
    byteLength: bytes.byteLength,
    topLevelTags: fields.map((field) => field.tag),
  };

  for (const field of fields) {
    if (field.tag === 1 && field.varint !== undefined) decoded.sequence = safeNumber(field.varint);
    if (field.tag === 2 && field.varint !== undefined) decoded.timestampMs = safeNumber(field.varint);
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.envelopeTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      const simpleAction = value ? decodeStreamerSimpleAction(value) : undefined;
      if (simpleAction) decoded.simpleAction = simpleAction;
    }
    if (field.tag === 8) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      const captureChange = value ? decodeStreamerCaptureChange(value) : undefined;
      if (captureChange) decoded.captureChange = captureChange;
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.envelopeTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      const romMessage = value ? decodeStreamerRomMessage(value) : undefined;
      if (romMessage) decoded.romMessage = romMessage;
    }
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.envelopeTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      const sendToRom = value ? decodeStreamerSendToRom(value) : undefined;
      if (sendToRom) decoded.sendToRom = sendToRom;
    }
    if (field.tag === STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      const systemStateChange = value ? decodeStreamerSystemStateChange(value) : undefined;
      if (systemStateChange) decoded.systemStateChange = systemStateChange;
    }
  }

  return decoded;
}

export function encodeStreamerInputMessage(input: EncodeStreamerInputMessageInput): Uint8Array {
  return encodeStreamerRomMessage({
    ...input,
    inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT,
  });
}

export function encodeStreamerTextMessage(input: EncodeStreamerInputMessageInput): Uint8Array {
  return encodeStreamerRomMessage({
    ...input,
    inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_Text,
  });
}

function encodeStreamerSimpleActionFeatureFlags(input: StreamerSimpleActionFeatureFlagsInput): Uint8Array {
  const bytes: number[] = [];
  for (const field of STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS) {
    const value = input[field.name] ?? 0;
    if (value) pushInt32Field(bytes, field.tag, value);
  }
  return new Uint8Array(bytes);
}

function decodeStreamerSimpleAction(bytes: Uint8Array): DecodedStreamerSimpleAction | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  let action: number = STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST;
  let args: string | undefined;
  let featureFlags: StreamerSimpleActionFeatureFlagsInput | undefined;

  for (const field of fields) {
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.actionTag && field.varint !== undefined) {
      action = safeNumber(field.varint) ?? action;
    }
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.argsTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) args = textDecoder.decode(value);
    }
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.featureFlagTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) featureFlags = decodeStreamerSimpleActionFeatureFlags(value);
    }
  }

  return {
    action,
    actionName: streamerSimpleActionName(action),
    args,
    seq: args === undefined ? undefined : readStreamerActionArgsSeq(args),
    featureFlags,
  };
}

function decodeStreamerSimpleActionFeatureFlags(bytes: Uint8Array): StreamerSimpleActionFeatureFlagsInput | undefined {
  const featureFlags: StreamerSimpleActionFeatureFlagsInput = {};
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  for (const field of fields) {
    if (field.varint === undefined) continue;
    const definition = STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS.find((item) => item.tag === field.tag);
    if (!definition) continue;
    const value = safeNumber(field.varint);
    if (value !== undefined) featureFlags[definition.name] = value;
  }
  return featureFlags;
}

function decodeStreamerCaptureChange(bytes: Uint8Array): DecodedStreamerCaptureChange | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  let captureType: number = STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP;
  let captureId: number | undefined;
  let desc: string | undefined;

  for (const field of fields) {
    if (field.tag === 1 && field.varint !== undefined) captureType = safeNumber(field.varint) ?? captureType;
    if (field.tag === 2 && field.varint !== undefined) captureId = safeNumber(field.varint);
    if (field.tag === 3) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) desc = textDecoder.decode(value);
    }
  }

  return {
    captureType,
    captureTypeName: streamerCaptureTypeName(captureType),
    captureId,
    desc,
  };
}

function decodeStreamerSystemStateChange(bytes: Uint8Array): DecodedStreamerSystemStateChange | undefined {
  const decoded: DecodedStreamerSystemStateChange = {};
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;

  for (const field of fields) {
    if (field.tag === STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.cursorShapeTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      const cursorShape = value ? decodeStreamerCursorShape(value) : undefined;
      if (cursorShape) decoded.cursorShape = cursorShape;
    }
  }

  return decoded;
}

function decodeStreamerCursorShape(bytes: Uint8Array): DecodedStreamerCursorShape | undefined {
  const decoded: DecodedStreamerCursorShape = {};
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;

  for (const field of fields) {
    if (field.varint !== undefined) {
      const value = decodeProtobufInt32(field.varint);
      if (value === undefined) continue;
      if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.posXTag) decoded.posX = value;
      if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.posYTag) decoded.posY = value;
      if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.widthTag) decoded.width = value;
      if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.heightTag) decoded.height = value;
      if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.cursorTypeTag) decoded.cursorType = value;
      if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.screenIdTag) decoded.screenId = value;
    }
    if (
      field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag &&
      field.byteLength !== undefined &&
      field.byteLength <= STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes
    ) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) decoded.byteValue = value.slice();
    }
    if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.coordinateXScaleTag) {
      const encoded = protobufFixed64FieldBytes(bytes, field);
      const value = encoded ? readProtobufDouble(encoded) : Number.NaN;
      if (Number.isFinite(value)) decoded.coordinateXScale = value;
    }
    if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.coordinateYScaleTag) {
      const encoded = protobufFixed64FieldBytes(bytes, field);
      const value = encoded ? readProtobufDouble(encoded) : Number.NaN;
      if (Number.isFinite(value)) decoded.coordinateYScale = value;
    }
  }

  return decoded;
}

function decodeStreamerSendToRom(bytes: Uint8Array): DecodedStreamerSendToRom | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  let inputType: number = STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT;
  let inputMessage: string | undefined;
  let displayId: number | undefined;

  for (const field of fields) {
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputTypeTag && field.varint !== undefined) {
      inputType = safeNumber(field.varint) ?? inputType;
    }
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputMessageTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) inputMessage = textDecoder.decode(value);
    }
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.displayIdTag && field.varint !== undefined) {
      displayId = safeNumber(field.varint);
    }
  }

  return {
    inputType,
    inputTypeName: streamerRomMessageTypeName(inputType),
    inputMessage,
    displayId,
  };
}

function decodeStreamerRomMessage(bytes: Uint8Array): DecodedStreamerRomMessage | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const decoded: DecodedStreamerRomMessage = {};

  for (const field of fields) {
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.nameTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) decoded.name = textDecoder.decode(value);
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.valueTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) decoded.value = textDecoder.decode(value);
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.displayIdTag && field.varint !== undefined) {
      decoded.displayId = safeNumber(field.varint);
    }
    if (
      field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.byteValueTag &&
      field.wireType === protobufWireType.lengthDelimited &&
      field.byteLength !== undefined
    ) {
      decoded.byteValueLength = field.byteLength;
    }
  }

  return decoded;
}

function readStreamerActionArgsSeq(args: string): number | undefined {
  try {
    const parsed = JSON.parse(args) as unknown;
    const record = asRecord(parsed);
    const seq = record?.seq;
    if (typeof seq === "number" && Number.isSafeInteger(seq)) return seq;
    if (typeof seq === "string" && /^\d+$/.test(seq)) {
      const value = Number(seq);
      return Number.isSafeInteger(value) ? value : undefined;
    }
  } catch {
    const match = args.match(/"seq"\s*:\s*(\d+)/);
    if (match) {
      const value = Number(match[1]);
      return Number.isSafeInteger(value) ? value : undefined;
    }
  }
  return undefined;
}

function safeNumber(value: bigint): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function decodeProtobufInt32(value: bigint): number | undefined {
  if (value < 0n || value > 0xffffffffffffffffn) return undefined;
  return Number(BigInt.asIntN(32, value));
}

function readProtobufDouble(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(0, true);
}

function streamerSimpleActionName(action: number): string | undefined {
  if (action === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) return "ACTION_TYPE_ECHO_REQUEST";
  if (action === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE) return "ACTION_TYPE_ECHO_RESPONSE";
  return undefined;
}

function streamerCaptureTypeName(captureType: number): string | undefined {
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP) return "CT_DESKTOP";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_WINDOW) return "CT_WINDOW";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_MUMU) return "CT_MUMU";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_HOOK) return "CT_HOOK";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_NONE) return "CT_NONE";
  return undefined;
}

function streamerRomMessageTypeName(inputType: number): string | undefined {
  for (const [name, value] of Object.entries(STREAMER_ROM_MESSAGE_TYPES)) {
    if (value === inputType) return name;
  }
  return undefined;
}

function formatJsonNumber(value: number | bigint): string {
  return BigInt(value).toString();
}
