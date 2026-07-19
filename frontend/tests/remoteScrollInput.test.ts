import { describe, expect, it } from "vitest";

import { isDesktopRemoteScrollTarget, RemoteScrollDeltaAccumulator } from "../src/remote/remoteScrollInput.js";

describe("RemoteScrollDeltaAccumulator", () => {
  it("converts browser content scrolling to the desktop UU vertical direction", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 0, deltaY: 12, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: -12,
    });
    expect(accumulator.push({ deltaX: 0, deltaY: -7, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: 7,
    });
  });

  it("keeps the existing direction for non-desktop targets", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 1, deltaY: 5, deltaMode: 0, pageHeight: 800, desktopTarget: false })).toEqual({
      deltaX: 1,
      deltaY: 5,
    });
  });

  it("normalizes line and page deltas to pixels", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 1, deltaY: 1, deltaMode: 1, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 18,
      deltaY: -18,
    });
    expect(accumulator.push({ deltaX: 0, deltaY: 1, deltaMode: 2, pageHeight: 640, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: -640,
    });
  });

  it("filters clear cross-axis trackpad noise without blocking diagonal scrolling", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 1, deltaY: 10, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: -10,
    });
    expect(accumulator.push({ deltaX: 10, deltaY: 1, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 10,
      deltaY: 0,
    });
    expect(accumulator.push({ deltaX: 6, deltaY: 8, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 6,
      deltaY: -8,
    });
  });

  it("accumulates fractional pixel deltas before emitting integers", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();
    const input = { deltaX: 0, deltaY: 0.4, deltaMode: 0, pageHeight: 800, desktopTarget: true };

    expect(accumulator.push(input)).toBeUndefined();
    expect(accumulator.push(input)).toBeUndefined();
    expect(accumulator.push(input)).toEqual({ deltaX: 0, deltaY: -1 });
    expect(accumulator.push(input)).toBeUndefined();

    accumulator.reset();
    expect(accumulator.push(input)).toBeUndefined();
  });

  it("ignores non-finite browser deltas", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(
      accumulator.push({
        deltaX: Number.NaN,
        deltaY: Number.POSITIVE_INFINITY,
        deltaMode: 0,
        pageHeight: 800,
        desktopTarget: true,
      }),
    ).toBeUndefined();
  });
});

describe("isDesktopRemoteScrollTarget", () => {
  it("limits the direction conversion to confirmed desktop targets", () => {
    expect(isDesktopRemoteScrollTarget(1)).toBe(true);
    expect(isDesktopRemoteScrollTarget(4)).toBe(true);
    expect(isDesktopRemoteScrollTarget(2)).toBe(false);
    expect(isDesktopRemoteScrollTarget(undefined)).toBe(false);
  });
});
