import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appBackend, uuCalls } from "./appBackendFixture.js";
import { TestPeerConnection } from "./appBrowserFakes.js";
import { getPrimaryAction, openAdvancedSettings, openOfficeMacControl } from "./appTestActions.js";
import {
  App,
  authReady,
  cleanupAppTest,
  seedLoginState,
  setupAppTest,
  writeLocalClipboardTextMock,
} from "./appTestEnvironment.js";

describe("App account and devices", () => {
  beforeEach(setupAppTest);
  afterEach(cleanupAppTest);

  it("renders the public landing page without loading product data", async () => {
    window.history.replaceState(null, "", "/");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "UU 远程桌面网页版" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /进入控制台/ })).not.toHaveLength(0);
    for (const link of screen.getAllByRole("link", { name: /进入控制台/ })) {
      expect(link).toHaveAttribute("href", "/devices");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns to the landing page from the console brand", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    await user.click(screen.getByRole("link", { name: "返回 UU Remote Web 首页" }));

    expect(await screen.findByRole("heading", { level: 1, name: "UU 远程桌面网页版" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("supports the app-aligned mobile login flow and local state export", async () => {
    window.localStorage.removeItem("uurc.loginState");
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("未登录");
    expect(screen.getByRole("heading", { name: "登录 UU Remote" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
    expect(screen.getByLabelText("用手机号登录")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "导入凭证" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "远控画面" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "我的设备" })).not.toBeInTheDocument();
    expect(screen.queryByText("Android 刷新")).not.toBeInTheDocument();
    expect(screen.queryByText("本地缓存")).not.toBeInTheDocument();
    expect(screen.queryByText(/ADB/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建网页设备" })).not.toBeInTheDocument();

    expect(screen.getByLabelText("区号")).toHaveValue("86");
    await user.type(screen.getByLabelText("手机号"), "13800000000");
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    await screen.findByText("验证码已发送");

    await user.type(screen.getByLabelText("短信验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await screen.findByRole("heading", { name: "我的设备" });
    expect(window.location.pathname).toBe("/devices");

    await user.click(screen.getByRole("link", { name: /账号与凭证/ }));
    await screen.findByRole("heading", { name: "账号与凭证" });
    expect(screen.getAllByText("已登录").length).toBeGreaterThan(0);
    expect(screen.getAllByText("user-1").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "导出账号凭证" }));
    await waitFor(() => {
      expect((screen.getByLabelText("账号凭证 JSON") as HTMLTextAreaElement).value).toContain(
        '"token": "header.payload.signature"',
      );
    });
    expect(writeLocalClipboardTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"token": "header.payload.signature"'),
    );
    expect(await screen.findByText("账号凭证已导出并复制到剪贴板")).toBeInTheDocument();
  });

  it("keeps exported credentials available when automatic clipboard writing fails", async () => {
    writeLocalClipboardTextMock.mockRejectedValueOnce(new Error("clipboard denied"));
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    await user.click(screen.getByRole("link", { name: /账号与凭证/ }));
    await screen.findByRole("heading", { name: "账号与凭证" });

    await user.click(screen.getByRole("button", { name: "导出账号凭证" }));

    expect(await screen.findByText("账号凭证已导出，自动复制失败，请手动复制")).toBeInTheDocument();
    expect((screen.getByLabelText("账号凭证 JSON") as HTMLTextAreaElement).value).toContain(
      '"token": "header.payload.signature"',
    );
  });

  it("uses a consumer remote-control flow: login page, device list, then focused control page", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    await screen.findByRole("button", { name: /Office Mac/ });
    expect(screen.queryByRole("heading", { name: "远控画面" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /连接 Office Mac/ }));

    await screen.findByRole("heading", { name: "Office Mac" });
    expect(window.location.pathname).toBe("/devices/desktop-1/control");
    expect(screen.getByRole("application", { name: "远控画面" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "我的设备" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回设备列表" })).toBeInTheDocument();

    await openAdvancedSettings(user);
    expect(screen.getByText("调试信息")).toBeInTheDocument();
  });

  it("auto-connects on entering a device when auto-connect is enabled", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    window.localStorage.setItem("uurc.autoConnect", "true");
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    await user.click(await screen.findByRole("button", { name: /连接 Office Mac/ }));
    await screen.findByRole("heading", { name: "Office Mac" });

    // 自动发起连接：无需手动点“开始连接”，信令网关 start 请求应自动出现。
    await waitFor(() => {
      expect(appBackend.requestLog.some((call) => call.path === "/api/remote/signal/start")).toBe(true);
    });
  });

  it("warns and does not occupy a room when browser WebRTC is unavailable", async () => {
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);

    const message = "当前浏览器未启用 WebRTC，无法建立远控画面。请允许 WebRTC 后重试。";
    expect(screen.getByText(message)).toBeInTheDocument();
    await user.click(getPrimaryAction("开始连接"));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(0);
    expect(appBackend.requestLog.some((call) => call.path === "/api/remote/signal/start")).toBe(false);
  });

  it("logs out from account management and returns to the login entry", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    expect(window.localStorage.getItem("uurc.loginState")).not.toBeNull();

    await user.click(screen.getByRole("link", { name: /账号与凭证/ }));
    await screen.findByRole("heading", { name: "账号与凭证" });
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await screen.findByRole("heading", { name: "登录 UU Remote" });
    expect(window.localStorage.getItem("uurc.loginState")).toBeNull();
    expect(screen.queryByRole("heading", { name: "我的设备" })).not.toBeInTheDocument();
  });

  it("blocks joining the current controller device as a remote target", async () => {
    seedLoginState({ ...authReady, deviceId: "desktop-1" });
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    expect(await screen.findByText("Office Mac")).toBeInTheDocument();
    expect(screen.getByText("本次登录设备")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 Office Mac/ })).not.toBeInTheDocument();

    expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(0);
  });
});
