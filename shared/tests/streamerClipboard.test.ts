import { describe, expect, it } from "vitest";

import {
  STREAMER_CLIPBOARD_DECODE_LIMITS,
  STREAMER_CLIPBOARD_FORMATS,
  STREAMER_CLIPBOARD_RESULTS,
  STREAMER_CLIPBOARD_RPC_WIRE_FIELDS,
  decodeStreamerClipboardMessage,
  decodeStreamerClipboardTextChangeRequest,
  decodeStreamerClipboardTextChangeResponse,
  decodeStreamerClipboardTextChangedNotification,
  encodeStreamerClipboardTextChangeRequest,
} from "../src/streamer/clipboard.js";

describe("streamer clipboard v3 RPC", () => {
  it("captures the Android v3 protobuf tags and enum values", () => {
    expect(STREAMER_CLIPBOARD_RPC_WIRE_FIELDS).toEqual({
      envelope: { sequenceTag: 1, timestampMsTag: 2, rpcRequestTag: 21, rpcResponseTag: 22 },
      request: { headerTag: 1, textChangeRequestTag: 10 },
      response: { headerTag: 1, textChangeResponseTag: 6 },
      header: { requestIdTag: 1 },
      textChangeRequest: { formatIdTag: 1, textTag: 2 },
      textChangeResponse: { resultTag: 1 },
    });
    expect(STREAMER_CLIPBOARD_FORMATS.text).toBe(1);
    expect(STREAMER_CLIPBOARD_RESULTS).toEqual({
      unspecified: 0,
      succeeded: 1,
      failed: 2,
    });
  });

  it("encodes the official ClipboardTextChangeReq envelope", () => {
    expect(
      Array.from(
        encodeStreamerClipboardTextChangeRequest({
          sequence: 1,
          timestampMs: 2,
          requestId: 3,
          text: "hi",
        }),
      ),
    ).toEqual([
      0x08, 0x01, 0x10, 0x02, 0xaa, 0x01, 0x0c, 0x0a, 0x02, 0x08, 0x03, 0x52, 0x06, 0x08, 0x01, 0x12, 0x02, 0x68, 0x69,
    ]);
  });

  it("decodes requests and the identical inbound changed-notification wire shape", () => {
    const encoded = encodeStreamerClipboardTextChangeRequest({
      sequence: 41n,
      timestampMs: 42n,
      requestId: 43n,
      text: "  first line\n第二行\n",
    });

    expect(decodeStreamerClipboardMessage(encoded)).toEqual({
      type: "text-change-request",
      sequence: 41n,
      timestampMs: 42n,
      requestId: 43n,
      formatId: STREAMER_CLIPBOARD_FORMATS.text,
      text: "  first line\n第二行\n",
    });
    expect(decodeStreamerClipboardTextChangeRequest(encoded)?.text).toBe("  first line\n第二行\n");
    expect(decodeStreamerClipboardTextChangedNotification(encoded)).toEqual({
      type: "text-changed-notification",
      sequence: 41n,
      timestampMs: 42n,
      requestId: 43n,
      formatId: STREAMER_CLIPBOARD_FORMATS.text,
      text: "  first line\n第二行\n",
    });
  });

  it("decodes ClipboardTextChangeResp success and failure fixtures", () => {
    const success = new Uint8Array([
      0x08,
      0x04,
      0x10,
      0x05,
      0xb2,
      0x01,
      0x08,
      0x0a,
      0x02,
      0x08,
      0x03,
      0x32,
      0x02,
      0x08,
      STREAMER_CLIPBOARD_RESULTS.succeeded,
    ]);
    expect(decodeStreamerClipboardTextChangeResponse(success)).toEqual({
      type: "text-change-response",
      sequence: 4n,
      timestampMs: 5n,
      requestId: 3n,
      result: STREAMER_CLIPBOARD_RESULTS.succeeded,
    });
    expect(decodeStreamerClipboardTextChangeRequest(success)).toBeUndefined();

    const failed = success.slice();
    failed[failed.byteLength - 1] = STREAMER_CLIPBOARD_RESULTS.failed;
    expect(decodeStreamerClipboardTextChangeResponse(failed)?.result).toBe(STREAMER_CLIPBOARD_RESULTS.failed);
  });

  it("preserves an empty value and whitespace-only clipboard content", () => {
    const empty = encodeStreamerClipboardTextChangeRequest({
      sequence: 0,
      timestampMs: 0,
      requestId: 0,
      text: "",
    });
    expect(decodeStreamerClipboardTextChangeRequest(empty)).toMatchObject({
      sequence: 0n,
      timestampMs: 0n,
      requestId: 0n,
      text: "",
    });

    const whitespace = encodeStreamerClipboardTextChangeRequest({
      sequence: 1,
      timestampMs: 2,
      requestId: 3,
      text: " \n\t ",
    });
    expect(decodeStreamerClipboardTextChangedNotification(whitespace)?.text).toBe(" \n\t ");
  });

  it("rejects malformed, ambiguous, oversized, and invalid UTF-8 payloads", () => {
    const valid = encodeStreamerClipboardTextChangeRequest({
      sequence: 1,
      timestampMs: 2,
      requestId: 3,
      text: "ok",
    });
    expect(decodeStreamerClipboardMessage(valid.subarray(0, valid.byteLength - 1))).toBeUndefined();
    expect(
      decodeStreamerClipboardMessage(new Uint8Array(STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes + 1)),
    ).toBeUndefined();

    const rpcField = valid.subarray(4);
    const ambiguous = new Uint8Array(valid.byteLength + rpcField.byteLength);
    ambiguous.set(valid);
    ambiguous.set(rpcField, valid.byteLength);
    expect(decodeStreamerClipboardMessage(ambiguous)).toBeUndefined();

    const invalidUtf8 = new Uint8Array([
      0xaa, 0x01, 0x0a, 0x0a, 0x02, 0x08, 0x01, 0x52, 0x04, 0x08, 0x01, 0x12, 0x01, 0xff,
    ]);
    expect(decodeStreamerClipboardTextChangedNotification(invalidUtf8)).toBeUndefined();
  });

  it("enforces outbound request ID and encoded text limits", () => {
    expect(() =>
      encodeStreamerClipboardTextChangeRequest({ sequence: 1, timestampMs: 2, requestId: -1, text: "x" }),
    ).toThrow(RangeError);
    expect(() =>
      encodeStreamerClipboardTextChangeRequest({
        sequence: 1,
        timestampMs: 2,
        requestId: 3,
        text: "x".repeat(STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes + 1),
      }),
    ).toThrow(/clipboard text exceeds/);
  });
});
