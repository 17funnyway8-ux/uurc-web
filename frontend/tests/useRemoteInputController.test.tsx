// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";
import { useRemoteInputController } from "../src/controllers/useRemoteInputController.js";

describe("useRemoteInputController", () => {
  const frameCallbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;

  beforeEach(() => {
    frameCallbacks.clear();
    nextFrame = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const frame = nextFrame++;
      frameCallbacks.set(frame, callback);
      return frame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => {
      frameCallbacks.delete(frame);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("coalesces ordinary moves and flushes the current point before a button event", async () => {
    const calls: Array<{ kind: string; input: unknown; critical?: boolean }> = [];
    const session = {
      sendMouseMove: vi.fn((input, options) => calls.push({ kind: "move", input, critical: options?.critical })),
      sendMouseButton: vi.fn((input) => calls.push({ kind: "button", input })),
      releaseAllInputs: vi.fn(),
    } as unknown as BrowserRemoteSession;
    let controller: ReturnType<typeof useRemoteInputController> | undefined;

    const view = render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller?.inputControlActive).toBe(true));
    const stage = view.getByTestId("stage") as HTMLDivElement;
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
    const video = stage.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 1000, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 500, configurable: true });
    flushFrames();

    act(() => {
      controller?.handleRemoteStagePointerMove(pointerEvent(stage, 10, 20));
      controller?.handleRemoteStagePointerMove(pointerEvent(stage, 40, 50));
      controller?.handleRemoteStagePointerMove(pointerEvent(stage, 90, 100));
    });
    expect(calls).toEqual([]);

    flushFrames();
    expect(calls).toEqual([
      {
        kind: "move",
        critical: false,
        input: { absX: 90, absY: 100, surfaceWidth: 1000, surfaceHeight: 500 },
      },
    ]);

    act(() => {
      controller?.handleRemoteStagePointerMove(pointerEvent(stage, 120, 130));
      controller?.handleRemoteStagePointerDown(pointerEvent(stage, 200, 210));
    });
    expect(calls.slice(-2)).toEqual([
      {
        kind: "move",
        critical: true,
        input: { absX: 200, absY: 210, surfaceWidth: 1000, surfaceHeight: 500 },
      },
      { kind: "button", input: { action: "mousePress", button: "primary" } },
    ]);
    flushFrames();
    expect(calls).toHaveLength(3);
  });

  it("does not send a press when its critical position cannot be sent", async () => {
    const onError = vi.fn();
    const session = {
      sendMouseMove: vi.fn(() => {
        throw new Error("control channel is congested");
      }),
      sendMouseButton: vi.fn(),
      releaseAllInputs: vi.fn(),
    } as unknown as BrowserRemoteSession;
    let controller: ReturnType<typeof useRemoteInputController> | undefined;

    const view = render(
      <Harness
        session={session}
        onError={onError}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller?.inputControlActive).toBe(true));
    const stage = view.getByTestId("stage") as HTMLDivElement;
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
    const video = stage.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 1000, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 500, configurable: true });
    flushFrames();

    act(() => controller?.handleRemoteStagePointerDown(pointerEvent(stage, 200, 210)));

    expect(session.sendMouseMove).toHaveBeenCalledOnce();
    expect(session.sendMouseButton).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("control channel is congested");
  });

  it("forwards macOS Cmd+C as a held Command key and a complete C press", async () => {
    const sendKeyboardInput = vi.fn();
    const session = {
      sendKeyboardInput,
      releaseAllInputs: vi.fn(),
    } as unknown as BrowserRemoteSession;
    const view = render(<Harness session={session} onController={() => undefined} targetPlatform={4} />);
    const stage = view.getByTestId("stage");

    fireEvent.keyDown(stage, { code: "MetaLeft", key: "Meta", metaKey: true });
    fireEvent.keyDown(stage, { code: "KeyC", key: "c", metaKey: true });
    fireEvent.keyUp(stage, { code: "MetaLeft", key: "Meta" });

    expect(sendKeyboardInput.mock.calls.map(([input]) => input)).toEqual([
      { action: "keyboardPress", value: 117 },
      { action: "keyboardPress", value: 31 },
      { action: "keyboardRelease", value: 31 },
      { action: "keyboardRelease", value: 117 },
    ]);
  });

  it("routes browser paste events through the target-aware session entry point", () => {
    const sendPastedText = vi.fn();
    const session = {
      sendPastedText,
      releaseAllInputs: vi.fn(),
    } as unknown as BrowserRemoteSession;
    const view = render(<Harness session={session} onController={() => undefined} targetPlatform={4} />);
    const stage = view.getByTestId("stage");

    fireEvent.paste(stage, {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "pasted from browser" : ""),
      },
    });

    expect(sendPastedText).toHaveBeenCalledWith("pasted from browser");
  });

  function flushFrames(): void {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    act(() => callbacks.forEach((callback) => callback(performance.now())));
  }
});

function Harness({
  session,
  onError = (message) => {
    throw new Error(message);
  },
  onController,
  targetPlatform = 1,
}: {
  session: BrowserRemoteSession;
  onError?: (message: string) => void;
  onController(controller: ReturnType<typeof useRemoteInputController>): void;
  targetPlatform?: number;
}) {
  const browserSessionRef = { current: session };
  const controller = useRemoteInputController({
    browserSessionRef,
    controlChannelState: "open",
    targetPlatform,
    primaryRemoteVideoId: "video-1",
    remoteStageViewMode: "fit",
    onError,
    onSessionStateChange: () => undefined,
  });
  useEffect(() => onController(controller), [controller, onController]);
  return (
    <div
      ref={controller.remoteStageRef}
      data-testid="stage"
      tabIndex={0}
      onKeyDown={controller.handleRemoteStageKeyDown}
      onKeyUp={controller.handleRemoteStageKeyUp}
      onPaste={controller.handleRemoteStagePaste}
    >
      <video data-active="true" />
      <div data-remote-cursor-overlay data-visible="false" />
    </div>
  );
}

function pointerEvent(stage: HTMLDivElement, clientX: number, clientY: number) {
  return {
    button: 0,
    clientX,
    clientY,
    currentTarget: stage,
    pointerId: 1,
    preventDefault: vi.fn(),
  } as unknown as Parameters<ReturnType<typeof useRemoteInputController>["handleRemoteStagePointerMove"]>[0];
}
