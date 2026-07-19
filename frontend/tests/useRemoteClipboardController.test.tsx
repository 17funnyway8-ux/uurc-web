// @vitest-environment jsdom
import { useEffect, type RefObject } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRemoteClipboardController } from "../src/controllers/useRemoteClipboardController.js";
import { RemoteClipboardPanel } from "../src/components/RemoteClipboardPanel.js";
import type { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";

describe("useRemoteClipboardController", () => {
  const readText = vi.fn<() => Promise<string>>();
  const writeText = vi.fn<(text: string) => Promise<void>>();
  let secureContextDescriptor: PropertyDescriptor | undefined;
  let clipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    secureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText, writeText },
    });
    readText.mockReset();
    readText.mockResolvedValue("");
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    restoreProperty(window, "isSecureContext", secureContextDescriptor);
    restoreProperty(navigator, "clipboard", clipboardDescriptor);
  });

  it("keeps automatic sync off by default and preserves exact text for a one-click sync", async () => {
    readText.mockResolvedValue("  hello\n");
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );

    await waitFor(() => expect(controller).toBeDefined());
    expect(controller?.clipboardSyncEnabled).toBe(false);
    expect(readText).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new Event("focus")));
    expect(readText).not.toHaveBeenCalled();

    act(() => controller?.handleReadLocalClipboard());
    await waitFor(() => expect(session.sendClipboardText).toHaveBeenCalledWith("  hello\n"));
    await waitFor(() => expect(controller?.localClipboardStatusLabel).toBe("已同步到远端（8 字符）"));
    expect(controller?.canSendClipboardText).toBe(true);

    act(() => controller?.handleRemoteClipboard("ignored while disabled"));
    act(() => controller?.handleReadLocalClipboard());
    await waitFor(() => expect(session.sendClipboardText).toHaveBeenCalledTimes(2));
  });

  it("reads once when enabled and progressively syncs after focus without duplicate permission attempts", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    readText.mockResolvedValueOnce("first").mockResolvedValueOnce("second").mockRejectedValueOnce(new Error("denied"));
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());

    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(session.sendClipboardText).toHaveBeenCalledWith("first"));
    expect(readText).toHaveBeenCalledTimes(1);

    now = 2_000;
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(readText).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(session.sendClipboardText).toHaveBeenCalledWith("second"));

    now = 3_000;
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(readText).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(controller?.localClipboardStatusLabel).toContain("请点击同步一次后重试"));

    now = 4_000;
    act(() => window.dispatchEvent(new Event("focus")));
    await Promise.resolve();
    expect(readText).toHaveBeenCalledTimes(3);
  });

  it("keeps rejected remote text available for a user-triggered copy", async () => {
    readText.mockResolvedValue("local");
    writeText.mockRejectedValueOnce(new Error("write denied")).mockResolvedValueOnce(undefined);
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());
    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(controller?.clipboardSyncEnabled).toBe(true));

    act(() => controller?.handleRemoteClipboard(" remote\ntext "));
    await waitFor(() => expect(controller?.remoteClipboardPendingText).toBe(" remote\ntext "));
    expect(controller?.remoteClipboardStatusLabel).toContain("请点击复制收到内容");

    act(() => window.dispatchEvent(new Event("focus")));
    await Promise.resolve();
    expect(readText).toHaveBeenCalledTimes(1);
    expect(session.sendClipboardText).toHaveBeenCalledTimes(1);

    act(() => controller?.handleCopyRemoteClipboard());
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(" remote\ntext "));
    await waitFor(() => expect(controller?.remoteClipboardPendingText).toBeNull());
    expect(controller?.remoteClipboardStatusLabel).toBe("已复制收到内容（13 字符）");
  });

  it("ignores remote notifications while sync is off", async () => {
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());

    act(() => controller?.handleRemoteClipboard("secret"));
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
    expect(controller?.remoteClipboardPendingText).toBeNull();
  });

  it("clears the session and ignores a stale clipboard read result", async () => {
    const pendingRead = deferred<string>();
    readText.mockReturnValue(pendingRead.promise);
    const session = createSession();
    let controller: ClipboardController | undefined;
    const view = render(
      <Harness
        session={session}
        sessionKey="device-a:1"
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());

    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    view.rerender(
      <Harness
        session={session}
        sessionKey="device-b:2"
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller?.clipboardSyncEnabled).toBe(false));

    await act(async () => pendingRead.resolve("stale text"));
    expect(session.sendClipboardText).not.toHaveBeenCalled();
    expect(controller?.localClipboardStatusLabel).toBe("尚未读取本机剪贴板");
  });

  it("does not let a pending write from an old session block the new session", async () => {
    const oldWrite = deferred<void>();
    writeText.mockReturnValueOnce(oldWrite.promise).mockResolvedValueOnce(undefined);
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());
    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(controller?.clipboardSyncEnabled).toBe(true));

    act(() => controller?.handleRemoteClipboard("old session"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("old session"));
    act(() => controller?.resetClipboardSession());
    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(controller?.clipboardSyncEnabled).toBe(true));
    act(() => controller?.handleRemoteClipboard("new session"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("new session"));
    await waitFor(() => expect(controller?.remoteClipboardStatusLabel).toBe("已同步到本机（11 字符）"));
    await act(async () => oldWrite.resolve());
    expect(controller?.remoteClipboardStatusLabel).toBe("已同步到本机（11 字符）");
  });

  it("does not let a pending write survive disabling and re-enabling sync", async () => {
    const oldWrite = deferred<void>();
    writeText.mockReturnValueOnce(oldWrite.promise).mockResolvedValueOnce(undefined);
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());
    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(controller?.clipboardSyncEnabled).toBe(true));

    act(() => controller?.handleRemoteClipboard("before disable"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("before disable"));
    act(() => controller?.handleClipboardSyncEnabledChange(false));
    act(() => controller?.handleClipboardSyncEnabledChange(true));
    await waitFor(() => expect(controller?.clipboardSyncEnabled).toBe(true));
    act(() => controller?.handleRemoteClipboard("after re-enable"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("after re-enable"));
    await waitFor(() => expect(controller?.remoteClipboardStatusLabel).toBe("已同步到本机（15 字符）"));
    await act(async () => oldWrite.resolve());
    expect(controller?.remoteClipboardStatusLabel).toBe("已同步到本机（15 字符）");
  });

  it("reports insecure contexts before requesting clipboard permission", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    const session = createSession();
    let controller: ClipboardController | undefined;
    render(
      <Harness
        session={session}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller).toBeDefined());

    expect(controller?.clipboardSyncAvailable).toBe(false);
    expect(controller?.canReadLocalClipboard).toBe(false);
    expect(controller?.localClipboardStatusLabel).toContain("HTTPS 或 localhost");
    act(() => controller?.handleClipboardSyncEnabledChange(true));
    expect(readText).not.toHaveBeenCalled();
  });

  it("renders separate direction statuses and a selectable remote-copy fallback", () => {
    const onCopyRemoteClipboard = vi.fn();
    render(
      <RemoteClipboardPanel
        canCopyRemoteClipboard
        canReadLocalClipboard
        canSendClipboardText={false}
        clipboardSyncAvailable
        clipboardSyncEnabled
        clipboardPreviewLabel="已开启"
        localClipboardStatusLabel="已同步到远端（5 字符）"
        remoteClipboardPendingText={" remote\ntext "}
        remoteClipboardStatusLabel="写入本机失败，请点击复制收到内容"
        onClipboardSyncEnabledChange={() => undefined}
        onCopyRemoteClipboard={onCopyRemoteClipboard}
        onReadLocalClipboard={() => undefined}
        onSendClipboardText={() => undefined}
      />,
    );

    expect(screen.getByText("本机到远端")).toBeInTheDocument();
    expect(screen.getByText("远端到本机")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "收到的内容" })).toHaveValue(" remote\ntext ");
    fireEvent.click(screen.getByRole("button", { name: "复制收到内容" }));
    expect(onCopyRemoteClipboard).toHaveBeenCalledOnce();
  });
});

type ClipboardController = ReturnType<typeof useRemoteClipboardController>;

function Harness({
  session,
  sessionKey = "device-a:1",
  onController,
}: {
  session: BrowserRemoteSession;
  sessionKey?: string;
  onController(controller: ClipboardController): void;
}) {
  const sessionRef = { current: session } as RefObject<BrowserRemoteSession | null>;
  const controller = useRemoteClipboardController({
    browserSessionRef: sessionRef,
    sessionKey,
    textChannelState: "open",
    onError: () => undefined,
    onSessionStateChange: () => undefined,
    showToast: () => undefined,
  });
  useEffect(() => onController(controller), [controller, onController]);
  return null;
}

function createSession(): BrowserRemoteSession {
  return {
    sendClipboardText: vi.fn(async () => undefined),
    getState: vi.fn(() => ({})),
  } as unknown as BrowserRemoteSession;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}
