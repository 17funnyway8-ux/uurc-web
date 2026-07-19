const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_SIGNED_INT64 = 0x7fffffffffffffffn;
const MAX_SIGNED_INT32 = 0x7fffffffn;
const STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES = 0x80000;

const protobufWireType = {
  varint: 0,
  fixed64: 1,
  lengthDelimited: 2,
  fixed32: 5,
} as const;

interface ProtobufField {
  tag: number;
  wireType: number;
  varint?: bigint;
  dataOffset?: number;
  byteLength?: number;
}

export const STREAMER_CLIPBOARD_RPC_WIRE_FIELDS = {
  envelope: {
    sequenceTag: 1,
    timestampMsTag: 2,
    rpcRequestTag: 21,
    rpcResponseTag: 22,
  },
  request: {
    headerTag: 1,
    textChangeRequestTag: 10,
  },
  response: {
    headerTag: 1,
    textChangeResponseTag: 6,
  },
  header: {
    requestIdTag: 1,
  },
  textChangeRequest: {
    formatIdTag: 1,
    textTag: 2,
  },
  textChangeResponse: {
    resultTag: 1,
  },
} as const;

export const STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS = {
  request: {
    clipRequestTag: 9,
  },
  response: {
    clipResponseTag: 5,
  },
  clipRequest: {
    formatDataAskTag: 2,
    dataBlockTag: 3,
  },
  clipResponse: {
    formatDataConfirmTag: 2,
    dataBlockConfirmTag: 3,
  },
  formatDataAsk: {
    formatIdTag: 1,
    blockKeyTag: 2,
    formatNameTag: 3,
  },
  formatDataConfirm: {
    resultTag: 1,
    blockKeyTag: 2,
    blockCountTag: 3,
  },
  dataBlock: {
    blockKeyTag: 1,
    blockIdTag: 2,
    dataTag: 3,
  },
  dataBlockConfirm: {
    blockKeyTag: 1,
    blockIdTag: 2,
    resultTag: 3,
  },
} as const;

export const STREAMER_CLIPBOARD_FORMATS = {
  text: 1,
  unicodeText: 13,
} as const;

export const STREAMER_CLIPBOARD_FORMAT_NAMES = {
  macUtf8Text: "public.utf8-plain-text",
} as const;

export const STREAMER_CLIPBOARD_RESULTS = {
  unspecified: 0,
  succeeded: 1,
  failed: 2,
} as const;

export const STREAMER_CLIPBOARD_DECODE_LIMITS = {
  maxMessageBytes: STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES,
  maxTextBytes: STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES - 256,
  maxFieldsPerMessage: 32,
  maxLengthDelimitedBytes: STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES,
} as const;

export type StreamerClipboardFormat = (typeof STREAMER_CLIPBOARD_FORMATS)[keyof typeof STREAMER_CLIPBOARD_FORMATS];
export type StreamerClipboardResult = (typeof STREAMER_CLIPBOARD_RESULTS)[keyof typeof STREAMER_CLIPBOARD_RESULTS];

export interface EncodeStreamerClipboardTextChangeRequestInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  text: string;
  formatId?: number;
}

export interface EncodeStreamerClipboardFormatDataAskRequestInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  blockKey: string;
  formatId?: number;
  formatName?: string;
}

export interface EncodeStreamerClipboardDataBlockConfirmResponseInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  blockKey: string;
  blockId: number;
  result?: number;
}

interface DecodedStreamerClipboardEnvelope {
  sequence: bigint;
  timestampMs: bigint;
  requestId: bigint;
}

export interface DecodedStreamerClipboardTextChangeRequest extends DecodedStreamerClipboardEnvelope {
  type: "text-change-request";
  formatId: number;
  text: string;
}

export interface DecodedStreamerClipboardTextChangeResponse extends DecodedStreamerClipboardEnvelope {
  type: "text-change-response";
  result: number;
}

export interface DecodedStreamerClipboardTextChangedNotification extends DecodedStreamerClipboardEnvelope {
  type: "text-changed-notification";
  formatId: number;
  text: string;
}

export type DecodedStreamerClipboardMessage =
  DecodedStreamerClipboardTextChangeRequest | DecodedStreamerClipboardTextChangeResponse;

export interface DecodedStreamerClipboardFormatDataConfirm extends DecodedStreamerClipboardEnvelope {
  type: "format-data-confirm";
  blockKey: string;
  blockCount: number;
  result: number;
}

export interface DecodedStreamerClipboardDataBlockRequest extends DecodedStreamerClipboardEnvelope {
  type: "data-block-request";
  blockKey: string;
  blockId: number;
  data: Uint8Array;
}

export interface DecodedStreamerClipboardDataBlockConfirm extends DecodedStreamerClipboardEnvelope {
  type: "data-block-confirm";
  blockKey: string;
  blockId: number;
  result: number;
}

export type DecodedStreamerClipboardV4Message =
  | DecodedStreamerClipboardFormatDataConfirm
  | DecodedStreamerClipboardDataBlockRequest
  | DecodedStreamerClipboardDataBlockConfirm;

export function encodeStreamerClipboardTextChangeRequest(
  input: EncodeStreamerClipboardTextChangeRequestInput,
): Uint8Array {
  const sequence = checkedInt64(input.sequence, "sequence");
  const timestampMs = checkedInt64(input.timestampMs, "timestampMs");
  const requestId = checkedInt64(input.requestId, "requestId");
  const formatId = input.formatId ?? STREAMER_CLIPBOARD_FORMATS.text;
  if (!Number.isSafeInteger(formatId) || formatId < 0 || BigInt(formatId) > MAX_SIGNED_INT32) {
    throw new RangeError("formatId must be a non-negative int32");
  }

  const encodedText = textEncoder.encode(input.text);
  if (encodedText.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes) {
    throw new RangeError(`clipboard text exceeds ${STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes} encoded bytes`);
  }

  const headerBytes: number[] = [];
  if (requestId !== 0n) pushVarintField(headerBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.header.requestIdTag, requestId);

  const textChangeBytes: number[] = [];
  if (formatId !== 0) {
    pushVarintField(textChangeBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.formatIdTag, formatId);
  }
  if (input.text !== "") {
    pushStringField(textChangeBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.textTag, input.text);
  }

  const requestBytes: number[] = [];
  pushMessageField(requestBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.headerTag, new Uint8Array(headerBytes));
  pushMessageField(
    requestBytes,
    STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.textChangeRequestTag,
    new Uint8Array(textChangeBytes),
  );

  const envelopeBytes: number[] = [];
  if (sequence !== 0n) {
    pushVarintField(envelopeBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.sequenceTag, sequence);
  }
  if (timestampMs !== 0n) {
    pushVarintField(envelopeBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.timestampMsTag, timestampMs);
  }
  pushMessageField(
    envelopeBytes,
    STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag,
    new Uint8Array(requestBytes),
  );

  const encoded = new Uint8Array(envelopeBytes);
  if (encoded.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes) {
    throw new RangeError(`clipboard message exceeds ${STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes} bytes`);
  }
  return encoded;
}

export function encodeStreamerClipboardFormatDataAskRequest(
  input: EncodeStreamerClipboardFormatDataAskRequestInput,
): Uint8Array {
  const formatId = input.formatId ?? STREAMER_CLIPBOARD_FORMATS.unicodeText;
  assertClipboardInt32(formatId, "formatId");
  if (!input.blockKey) throw new RangeError("blockKey must not be empty");

  const bodyBytes: number[] = [];
  if (formatId !== 0) {
    pushVarintField(bodyBytes, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataAsk.formatIdTag, formatId);
  }
  pushStringField(bodyBytes, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataAsk.blockKeyTag, input.blockKey);
  if (input.formatName) {
    pushStringField(bodyBytes, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataAsk.formatNameTag, input.formatName);
  }

  return encodeClipboardV4Envelope({
    sequence: input.sequence,
    timestampMs: input.timestampMs,
    requestId: input.requestId,
    rpcTag: STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag,
    clipboardTag: STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.request.clipRequestTag,
    bodyTag: STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipRequest.formatDataAskTag,
    body: new Uint8Array(bodyBytes),
  });
}

export function encodeStreamerClipboardDataBlockConfirmResponse(
  input: EncodeStreamerClipboardDataBlockConfirmResponseInput,
): Uint8Array {
  assertClipboardPositiveInt32(input.blockId, "blockId");
  const result = input.result ?? STREAMER_CLIPBOARD_RESULTS.succeeded;
  assertClipboardInt32(result, "result");
  if (!input.blockKey) throw new RangeError("blockKey must not be empty");

  const bodyBytes: number[] = [];
  pushStringField(bodyBytes, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockKeyTag, input.blockKey);
  pushVarintField(bodyBytes, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockIdTag, input.blockId);
  if (result !== STREAMER_CLIPBOARD_RESULTS.unspecified) {
    pushVarintField(bodyBytes, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.resultTag, result);
  }

  return encodeClipboardV4Envelope({
    sequence: input.sequence,
    timestampMs: input.timestampMs,
    requestId: input.requestId,
    rpcTag: STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcResponseTag,
    clipboardTag: STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.response.clipResponseTag,
    bodyTag: STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.dataBlockConfirmTag,
    body: new Uint8Array(bodyBytes),
  });
}

export function decodeStreamerClipboardMessage(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardMessage | undefined {
  const bytes = toUint8Array(data);
  const envelopeFields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!envelopeFields) return undefined;

  const sequence = readInt64(envelopeFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.sequenceTag);
  const timestampMs = readInt64(envelopeFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.timestampMsTag);
  if (sequence === undefined || timestampMs === undefined) return undefined;

  const rpcFields = envelopeFields.filter(
    (field) =>
      field.tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag ||
      field.tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcResponseTag,
  );
  if (rpcFields.length !== 1) return undefined;
  const rpcBytes = protobufLengthDelimitedFieldBytes(bytes, rpcFields[0]);
  if (!rpcBytes) return undefined;

  if (rpcFields[0].tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag) {
    return decodeTextChangeRequest(rpcBytes, sequence, timestampMs);
  }
  return decodeTextChangeResponse(rpcBytes, sequence, timestampMs);
}

export function decodeStreamerClipboardV4Message(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardV4Message | undefined {
  const bytes = toUint8Array(data);
  const envelopeFields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!envelopeFields) return undefined;

  const sequence = readInt64(envelopeFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.sequenceTag);
  const timestampMs = readInt64(envelopeFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.timestampMsTag);
  if (sequence === undefined || timestampMs === undefined) return undefined;

  const rpcFields = envelopeFields.filter(
    (field) =>
      field.tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag ||
      field.tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcResponseTag,
  );
  if (rpcFields.length !== 1) return undefined;
  const rpcBytes = protobufLengthDelimitedFieldBytes(bytes, rpcFields[0]);
  if (!rpcBytes) return undefined;

  const rpcMessageFields = readClipboardFields(rpcBytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!rpcMessageFields) return undefined;
  const headerBytes = readSingleMessageField(
    rpcBytes,
    rpcMessageFields,
    STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.headerTag,
  );
  if (!headerBytes) return undefined;
  const requestId = decodeRequestId(headerBytes);
  if (requestId === undefined) return undefined;

  if (rpcFields[0].tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag) {
    const clipBytes = readSingleMessageField(
      rpcBytes,
      rpcMessageFields,
      STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.request.clipRequestTag,
    );
    return clipBytes ? decodeClipboardV4Request(clipBytes, sequence, timestampMs, requestId) : undefined;
  }

  const clipBytes = readSingleMessageField(
    rpcBytes,
    rpcMessageFields,
    STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.response.clipResponseTag,
  );
  return clipBytes ? decodeClipboardV4Response(clipBytes, sequence, timestampMs, requestId) : undefined;
}

export function decodeStreamerClipboardTextChangeRequest(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardTextChangeRequest | undefined {
  const decoded = decodeStreamerClipboardMessage(data);
  return decoded?.type === "text-change-request" ? decoded : undefined;
}

export function decodeStreamerClipboardTextChangeResponse(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardTextChangeResponse | undefined {
  const decoded = decodeStreamerClipboardMessage(data);
  return decoded?.type === "text-change-response" ? decoded : undefined;
}

// The Android client names the inbound wrapper ClipboardTextChangedRecvReq, but it
// reuses RpcRequest.text_change_request on the wire.
export function decodeStreamerClipboardTextChangedNotification(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardTextChangedNotification | undefined {
  const decoded = decodeStreamerClipboardTextChangeRequest(data);
  if (!decoded) return undefined;
  return { ...decoded, type: "text-changed-notification" };
}

function decodeTextChangeRequest(
  bytes: Uint8Array,
  sequence: bigint,
  timestampMs: bigint,
): DecodedStreamerClipboardTextChangeRequest | undefined {
  const fields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!fields) return undefined;
  const headerBytes = readSingleMessageField(bytes, fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.headerTag);
  const bodyBytes = readSingleMessageField(
    bytes,
    fields,
    STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.textChangeRequestTag,
  );
  if (!headerBytes || !bodyBytes) return undefined;

  const requestId = decodeRequestId(headerBytes);
  const bodyFields = readClipboardFields(bodyBytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (requestId === undefined || !bodyFields) return undefined;

  const formatId = readInt32(bodyFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.formatIdTag);
  const text = readText(bodyBytes, bodyFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.textTag);
  if (formatId === undefined || text === undefined) return undefined;

  return {
    type: "text-change-request",
    sequence,
    timestampMs,
    requestId,
    formatId,
    text,
  };
}

function decodeTextChangeResponse(
  bytes: Uint8Array,
  sequence: bigint,
  timestampMs: bigint,
): DecodedStreamerClipboardTextChangeResponse | undefined {
  const fields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!fields) return undefined;
  const headerBytes = readSingleMessageField(bytes, fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.response.headerTag);
  const bodyBytes = readSingleMessageField(
    bytes,
    fields,
    STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.response.textChangeResponseTag,
  );
  if (!headerBytes || !bodyBytes) return undefined;

  const requestId = decodeRequestId(headerBytes);
  const bodyFields = readClipboardFields(bodyBytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (requestId === undefined || !bodyFields) return undefined;
  const result = readInt32(bodyFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeResponse.resultTag);
  if (result === undefined) return undefined;

  return {
    type: "text-change-response",
    sequence,
    timestampMs,
    requestId,
    result,
  };
}

function decodeClipboardV4Request(
  bytes: Uint8Array,
  sequence: bigint,
  timestampMs: bigint,
  requestId: bigint,
): DecodedStreamerClipboardDataBlockRequest | undefined {
  const fields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!fields) return undefined;
  const supportedFields = fields.filter(
    (field) => field.tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipRequest.dataBlockTag,
  );
  if (supportedFields.length !== 1) return undefined;
  const bodyBytes = protobufLengthDelimitedFieldBytes(bytes, supportedFields[0]);
  if (!bodyBytes) return undefined;
  const bodyFields = readClipboardFields(bodyBytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!bodyFields) return undefined;

  const blockKey = readText(bodyBytes, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlock.blockKeyTag);
  const blockId = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlock.blockIdTag);
  const blockData = readBytes(bodyBytes, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlock.dataTag);
  if (!blockKey || blockId === undefined || !blockData) return undefined;

  return {
    type: "data-block-request",
    sequence,
    timestampMs,
    requestId,
    blockKey,
    blockId,
    data: blockData,
  };
}

function decodeClipboardV4Response(
  bytes: Uint8Array,
  sequence: bigint,
  timestampMs: bigint,
  requestId: bigint,
): DecodedStreamerClipboardFormatDataConfirm | DecodedStreamerClipboardDataBlockConfirm | undefined {
  const fields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!fields) return undefined;
  const supportedFields = fields.filter(
    (field) =>
      field.tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.formatDataConfirmTag ||
      field.tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.dataBlockConfirmTag,
  );
  if (supportedFields.length !== 1) return undefined;
  const bodyBytes = protobufLengthDelimitedFieldBytes(bytes, supportedFields[0]);
  if (!bodyBytes) return undefined;
  const bodyFields = readClipboardFields(bodyBytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  if (!bodyFields) return undefined;

  if (supportedFields[0].tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.formatDataConfirmTag) {
    const result = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataConfirm.resultTag);
    const blockKey = readText(
      bodyBytes,
      bodyFields,
      STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataConfirm.blockKeyTag,
    );
    const blockCount = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataConfirm.blockCountTag);
    if (result === undefined || !blockKey || blockCount === undefined) return undefined;
    return {
      type: "format-data-confirm",
      sequence,
      timestampMs,
      requestId,
      result,
      blockKey,
      blockCount,
    };
  }

  const blockKey = readText(bodyBytes, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockKeyTag);
  const blockId = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockIdTag);
  const result = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.resultTag);
  if (!blockKey || blockId === undefined || result === undefined) return undefined;
  return {
    type: "data-block-confirm",
    sequence,
    timestampMs,
    requestId,
    blockKey,
    blockId,
    result,
  };
}

function encodeClipboardV4Envelope(input: {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  rpcTag: number;
  clipboardTag: number;
  bodyTag: number;
  body: Uint8Array;
}): Uint8Array {
  const sequence = checkedInt64(input.sequence, "sequence");
  const timestampMs = checkedInt64(input.timestampMs, "timestampMs");
  const requestId = checkedInt64(input.requestId, "requestId");

  const headerBytes: number[] = [];
  if (requestId !== 0n) pushVarintField(headerBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.header.requestIdTag, requestId);

  const clipboardBytes: number[] = [];
  pushMessageField(clipboardBytes, input.bodyTag, input.body);

  const rpcBytes: number[] = [];
  pushMessageField(rpcBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.headerTag, new Uint8Array(headerBytes));
  pushMessageField(rpcBytes, input.clipboardTag, new Uint8Array(clipboardBytes));

  const envelopeBytes: number[] = [];
  if (sequence !== 0n) {
    pushVarintField(envelopeBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.sequenceTag, sequence);
  }
  if (timestampMs !== 0n) {
    pushVarintField(envelopeBytes, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.timestampMsTag, timestampMs);
  }
  pushMessageField(envelopeBytes, input.rpcTag, new Uint8Array(rpcBytes));

  const encoded = new Uint8Array(envelopeBytes);
  if (encoded.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes) {
    throw new RangeError(`clipboard message exceeds ${STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes} bytes`);
  }
  return encoded;
}

function decodeRequestId(bytes: Uint8Array): bigint | undefined {
  const fields = readClipboardFields(bytes, STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes);
  return fields ? readInt64(fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.header.requestIdTag) : undefined;
}

function readSingleMessageField(
  bytes: Uint8Array,
  fields: readonly ProtobufField[],
  tag: number,
): Uint8Array | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  if (matching.length !== 1) return undefined;
  return protobufLengthDelimitedFieldBytes(bytes, matching[0]);
}

function readInt64(fields: readonly ProtobufField[], tag: number): bigint | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  if (matching.some((field) => field.wireType !== protobufWireType.varint || field.varint === undefined)) {
    return undefined;
  }
  const value = matching.at(-1)?.varint ?? 0n;
  return value <= MAX_SIGNED_INT64 ? value : undefined;
}

function readInt32(fields: readonly ProtobufField[], tag: number): number | undefined {
  const value = readInt64(fields, tag);
  return value !== undefined && value <= MAX_SIGNED_INT32 ? Number(value) : undefined;
}

function readText(bytes: Uint8Array, fields: readonly ProtobufField[], tag: number): string | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  if (matching.some((field) => field.wireType !== protobufWireType.lengthDelimited)) return undefined;
  const field = matching.at(-1);
  if (!field) return "";
  if (field.byteLength === undefined || field.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes) {
    return undefined;
  }
  const encoded = protobufLengthDelimitedFieldBytes(bytes, field);
  if (!encoded) return undefined;
  try {
    return textDecoder.decode(encoded);
  } catch {
    return undefined;
  }
}

function readBytes(bytes: Uint8Array, fields: readonly ProtobufField[], tag: number): Uint8Array | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  if (matching.some((field) => field.wireType !== protobufWireType.lengthDelimited)) return undefined;
  const field = matching.at(-1);
  if (!field) return new Uint8Array();
  if (field.byteLength === undefined || field.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes) {
    return undefined;
  }
  return protobufLengthDelimitedFieldBytes(bytes, field);
}

function readClipboardFields(bytes: Uint8Array, maxBytes: number): ProtobufField[] | undefined {
  if (bytes.byteLength > maxBytes) return undefined;
  const fields = readProtobufFields(bytes);
  if (!fields || fields.length > STREAMER_CLIPBOARD_DECODE_LIMITS.maxFieldsPerMessage) return undefined;
  return fields;
}

function pushVarint(bytes: number[], value: number | bigint): void {
  let remaining = BigInt(value);
  if (remaining < 0n) throw new RangeError("protobuf varint value must be non-negative");

  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
}

function pushFieldKey(bytes: number[], fieldNumber: number, wireType: number): void {
  pushVarint(bytes, fieldNumber * 8 + wireType);
}

function pushVarintField(bytes: number[], fieldNumber: number, value: number | bigint): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.varint);
  pushVarint(bytes, value);
}

function pushStringField(bytes: number[], fieldNumber: number, value: string): void {
  const encoded = textEncoder.encode(value);
  pushFieldKey(bytes, fieldNumber, protobufWireType.lengthDelimited);
  pushVarint(bytes, encoded.byteLength);
  for (const byte of encoded) bytes.push(byte);
}

function pushMessageField(bytes: number[], fieldNumber: number, payload: Uint8Array): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.lengthDelimited);
  pushVarint(bytes, payload.byteLength);
  for (const byte of payload) bytes.push(byte);
}

function readProtobufFields(bytes: Uint8Array): ProtobufField[] | undefined {
  const fields: ProtobufField[] = [];
  let offset = 0;

  while (offset < bytes.byteLength) {
    if (fields.length >= STREAMER_CLIPBOARD_DECODE_LIMITS.maxFieldsPerMessage) return undefined;
    const key = readVarint(bytes, offset);
    if (!key) return undefined;
    offset = key.nextOffset;
    const tag = Number(key.value >> 3n);
    const wireType = Number(key.value & 0x07n);
    if (!Number.isSafeInteger(tag) || tag <= 0 || tag > 0x1fffffff) return undefined;

    if (wireType === protobufWireType.varint) {
      const value = readVarint(bytes, offset);
      if (!value) return undefined;
      offset = value.nextOffset;
      fields.push({ tag, wireType, varint: value.value });
      continue;
    }
    if (wireType === protobufWireType.fixed64) {
      const dataOffset = offset;
      offset += 8;
      if (offset > bytes.byteLength) return undefined;
      fields.push({ tag, wireType, dataOffset, byteLength: 8 });
      continue;
    }
    if (wireType === protobufWireType.lengthDelimited) {
      const length = readVarint(bytes, offset);
      if (!length) return undefined;
      offset = length.nextOffset;
      const byteLength = Number(length.value);
      if (
        !Number.isSafeInteger(byteLength) ||
        byteLength < 0 ||
        byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxLengthDelimitedBytes ||
        byteLength > bytes.byteLength - offset
      ) {
        return undefined;
      }
      fields.push({ tag, wireType, dataOffset: offset, byteLength });
      offset += byteLength;
      continue;
    }
    if (wireType === protobufWireType.fixed32) {
      const dataOffset = offset;
      offset += 4;
      if (offset > bytes.byteLength) return undefined;
      fields.push({ tag, wireType, dataOffset, byteLength: 4 });
      continue;
    }
    return undefined;
  }

  return fields;
}

function protobufLengthDelimitedFieldBytes(bytes: Uint8Array, field: ProtobufField): Uint8Array | undefined {
  if (field.wireType !== protobufWireType.lengthDelimited) return undefined;
  if (field.dataOffset === undefined || field.byteLength === undefined) return undefined;
  return bytes.subarray(field.dataOffset, field.dataOffset + field.byteLength);
}

function readVarint(bytes: Uint8Array, startOffset: number): { value: bigint; nextOffset: number } | undefined {
  let value = 0n;
  let offset = startOffset;

  for (let index = 0; index < 10 && offset < bytes.byteLength; index += 1) {
    const byte = bytes[offset];
    if (index === 9 && byte > 1) return undefined;
    value |= BigInt(byte & 0x7f) << BigInt(index * 7);
    offset += 1;
    if ((byte & 0x80) === 0) return { value, nextOffset: offset };
  }
  return undefined;
}

function checkedInt64(value: number | bigint, name: string): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(`${name} must be a non-negative safe integer or bigint`);
  }
  const normalized = BigInt(value);
  if (normalized < 0n || normalized > MAX_SIGNED_INT64) {
    throw new RangeError(`${name} must fit in a non-negative int64`);
  }
  return normalized;
}

function assertClipboardInt32(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || BigInt(value) > MAX_SIGNED_INT32) {
    throw new RangeError(`${name} must be a non-negative int32`);
  }
}

function assertClipboardPositiveInt32(value: number, name: string): void {
  assertClipboardInt32(value, name);
  if (value === 0) throw new RangeError(`${name} must be a positive int32`);
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
