// @vitest-environment jsdom
import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DecodedStreamerCursorShape } from "@uurc/shared/streamerProtocol";

import { useRemoteCursorController } from "../src/controllers/useRemoteCursorController.js";
import type { RemoteMediaGeometry } from "../src/remote/remoteMediaGeometry.js";

describe("useRemoteCursorController", () => {
  let handleRemoteCursorShape: (shape: DecodedStreamerCursorShape | null) => void = () => undefined;
  let nextObjectUrl = 1;
  const createObjectURL = vi.fn(() => `blob:cursor-${nextObjectUrl++}`);
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    nextObjectUrl = 1;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies shapes imperatively, revokes old URLs and resets after a display switch", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("default");

    act(() => handleRemoteCursorShape(cursorShape({ posX: 2, posY: 3 })));
    expect(stage.style.getPropertyValue("--remote-cursor")).toContain('url("blob:cursor-1") 2 3, pointer');

    act(() => handleRemoteCursorShape(cursorShape({ posX: 4, posY: 5 })));
    expect(stage.style.getPropertyValue("--remote-cursor")).toContain('url("blob:cursor-2") 4 5, pointer');
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor-1");

    view.rerender(<CursorHarness active primaryVideoId="video-2" />);
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("default");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor-2");

    view.unmount();
  });

  it("uses a transform-driven overlay for touch pointers and hides it outside control mode", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    const overlay = view.getByTestId("overlay");
    act(() => handleRemoteCursorShape(cursorShape({ posX: 2, posY: 3 })));

    act(() => stage.dispatchEvent(pointerEvent("pointerenter", { clientX: 100, clientY: 100 })));
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("none");
    expect(overlay.dataset.visible).toBe("true");
    expect(overlay.dataset.hasImage).toBe("true");
    expect(overlay.style.transform).toBe("translate3d(88px, 77px, 0)");

    view.rerender(<CursorHarness active={false} primaryVideoId="video-1" />);
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("");
    expect(overlay.dataset.visible).toBe("false");

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor-1");
  });

  function CursorHarness({ active, primaryVideoId }: { active: boolean; primaryVideoId: string }) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const geometryRef = useRef<RemoteMediaGeometry>({
      containerRect: { left: 10, top: 20, width: 1000, height: 500 },
      displayRect: { left: 10, top: 20, width: 1000, height: 500 },
      visibleRect: { left: 10, top: 20, width: 1000, height: 500 },
      mediaWidth: 1600,
      mediaHeight: 800,
      scale: 0.625,
    });
    const controller = useRemoteCursorController({ stageRef, geometryRef, active, primaryVideoId });
    handleRemoteCursorShape = controller.handleRemoteCursorShape;
    return (
      <div ref={stageRef} data-testid="stage">
        <div data-remote-cursor-overlay data-visible="false" data-testid="overlay" />
      </div>
    );
  }
});

function cursorShape(overrides: Partial<DecodedStreamerCursorShape>): DecodedStreamerCursorShape {
  return {
    width: 16,
    height: 24,
    posX: 1,
    posY: 1,
    byteValue: pngHeader(16, 24),
    cursorType: 0x7f89,
    ...overrides,
  };
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function pointerEvent(type: string, input: { clientX: number; clientY: number }): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
    pointerType: { value: "touch" },
  });
  return event;
}
