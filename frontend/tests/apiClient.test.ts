import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMOTE_SESSION_HEADER } from "@uurc/shared/remoteSession";

import {
  cancelRemoteAssistance,
  getRemoteAssistanceControlMode,
  getRuntimeProfile,
  getRemoteSignalDiagnostics,
  getRemoteSignalEvents,
  joinRemoteAssistanceByCode,
  joinRemoteAssistanceByConfirmation,
  sendRemoteSignalControl,
  sendRemoteSignalSoac,
  updateRoomAppFlag,
} from "../src/api/client.js";

describe("frontend API client remote signal helpers", () => {
  beforeEach(() => {
    window.sessionStorage.setItem("uurc.remoteSessionId", "0123456789abcdef0123456789abcdef");
    window.localStorage.setItem(
      "uurc.loginState",
      JSON.stringify({
        token: "header.payload.signature",
        userId: "user-1",
        clientId: "client-1",
        deviceId: "web-device-1",
      }),
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("calls backend signal event, control, and SOAC routes", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ path: String(input), init });
        if (String(input) === "/api/remote/signal/events") {
          return jsonResponse([{ id: 1, direction: "inbound", event: "soac", receivedAt: "now", payload: [] }]);
        }
        if (String(input) === "/api/runtime") {
          return jsonResponse({
            ok: true,
            runtime: "node",
            uuProxyPath: "/api/proxy/uu",
            signalGateway: "node-socket-io",
            remoteApiBase: "/api/remote",
            wispProxy: false,
          });
        }
        if (String(input) === "/api/remote/signal/diagnostics") {
          return jsonResponse({
            stage: "answer_missing",
            blocker: "answer_missing",
            checks: {
              signalGatewayConnected: true,
              controlAckReceived: true,
              offerSent: true,
              beControlledReceived: true,
              answerReceived: false,
            },
            counts: {
              inbound: 2,
              outbound: 1,
            },
          });
        }
        if (String(input) === "/api/remote/signal/control") {
          return jsonResponse({
            event: "control",
            ack: [],
            control: { ackStatus: "success" },
            emittedAt: "now",
            ackReceivedAt: "now",
          });
        }
        if (String(input) === "/api/remote/signal/soac") {
          return jsonResponse({ event: "soac", payload: {}, emittedAt: "now" });
        }
        if (String(input) === "/api/proxy/uu") {
          return jsonResponse({
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: { code: 0 },
          });
        }
        return jsonResponse({});
      }),
    );

    await expect(getRuntimeProfile()).resolves.toMatchObject({
      runtime: "node",
      uuProxyPath: "/api/proxy/uu",
      remoteApiBase: "/api/remote",
    });
    await expect(getRemoteSignalEvents()).resolves.toHaveLength(1);
    await expect(getRemoteSignalDiagnostics()).resolves.toMatchObject({
      stage: "answer_missing",
      blocker: "answer_missing",
    });
    await expect(
      sendRemoteSignalControl({
        appControlId: "control-1",
        appDataBase64: "AQID",
        streamerData: "{}",
      }),
    ).resolves.toMatchObject({ event: "control" });
    await expect(
      sendRemoteSignalSoac({
        type: "offer",
        appControlId: "control-1",
        sdp: "v=0",
      }),
    ).resolves.toMatchObject({ event: "soac" });
    await expect(updateRoomAppFlag({ publisherDeviceId: "desktop-1", controlMode: null })).resolves.toMatchObject({
      appFlag: { controlMode: null },
    });

    expect(
      calls.map((call) => [
        call.path,
        call.init?.method ?? "GET",
        call.init?.body ? JSON.parse(String(call.init.body)) : null,
      ]),
    ).toEqual([
      ["/api/runtime", "GET", null],
      ["/api/remote/signal/events", "GET", null],
      ["/api/remote/signal/diagnostics", "GET", null],
      [
        "/api/remote/signal/control",
        "POST",
        {
          appControlId: "control-1",
          appDataBase64: "AQID",
          streamerData: "{}",
        },
      ],
      [
        "/api/remote/signal/soac",
        "POST",
        {
          type: "offer",
          appControlId: "control-1",
          sdp: "v=0",
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v1/room/app_flag",
          body: {
            publisher_device_id: "desktop-1",
            app_flag: {
              control_mode: null,
            },
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
    ]);
    for (const call of calls.filter((item) => item.path.startsWith("/api/remote/signal"))) {
      expect(new Headers(call.init?.headers).get(REMOTE_SESSION_HEADER)).toBe("0123456789abcdef0123456789abcdef");
    }
  });

  it("calls UU remote assistance routes through the signed proxy", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ path: String(input), init });
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu") {
          return jsonResponse({});
        }
        if (request.path === "/api/v2/room/share/control_mode") {
          return jsonResponse(
            proxyResponse({
              code: 0,
              data: {
                can_remote_control: true,
                control_mode: "by_password",
              },
            }),
          );
        }
        if (request.path === "/api/v2/room/join/share/by_code") {
          return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-room-token")));
        }
        if (request.path === "/api/v2/room/join/share/by_confirmation") {
          return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-confirm-room-token")));
        }
        if (request.path === "/api/v2/room/share/cancel_remote_assist") {
          return jsonResponse(proxyResponse({ code: 0, msg: "ok" }));
        }
        return jsonResponse({});
      }),
    );

    await expect(getRemoteAssistanceControlMode("982123456")).resolves.toMatchObject({
      connectId: "982123456",
      canRemoteControl: true,
      controlMode: "by_password",
    });
    await expect(
      joinRemoteAssistanceByCode({
        connectId: "982123456",
        connectCode: "L6026CCD",
        controlMode: "by_password",
      }),
    ).resolves.toMatchObject({
      assistance: {
        connectId: "982123456",
        connectCodeProvided: true,
        controlMode: "by_password",
        deviceName: "Partner PC",
        targetPlatform: 4,
      },
      roomConfigSummary: {
        signalServers: ["wss://assist.example"],
      },
    });
    await expect(
      joinRemoteAssistanceByConfirmation({
        connectId: "982123456",
        controlId: "control-1",
        controlMode: "by_confirmation",
      }),
    ).resolves.toMatchObject({
      assistance: {
        connectId: "982123456",
        controlId: "control-1",
        usedConfirmation: true,
        targetPlatform: 4,
      },
    });
    await expect(cancelRemoteAssistance("982123456")).resolves.toMatchObject({
      body: {
        code: 0,
      },
    });

    expect(
      calls.map((call) => [
        call.path,
        call.init?.method ?? "GET",
        call.init?.body ? JSON.parse(String(call.init.body)) : null,
      ]),
    ).toEqual([
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/share/control_mode",
          body: {
            connect_id: "982123456",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/join/share/by_code",
          body: {
            connect_id: "982123456",
            connect_code: "L6026CCD",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/join/share/by_confirmation",
          body: {
            connect_id: "982123456",
            control_id: "control-1",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/share/cancel_remote_assist",
          body: {
            connect_id: "982123456",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
    ]);
  });

  it.each([
    ["device_platform", { device_platform: 2, platform: 1 }, 2],
    ["platform", { platform: 1 }, 1],
  ])("falls back to %s when joining remote assistance", async (_field, platformFields, expectedPlatform) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu" || request.path !== "/api/v2/room/join/share/by_code") {
          return jsonResponse({});
        }
        return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-room-token", platformFields)));
      }),
    );

    await expect(
      joinRemoteAssistanceByCode({ connectId: "982123456", connectCode: "L6026CCD" }),
    ).resolves.toMatchObject({
      assistance: { targetPlatform: expectedPlatform },
    });
  });

  it("cancels a joined assistance room and clears the local session when the platform is missing", async () => {
    const requestedPaths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu") return jsonResponse({});
        requestedPaths.push(request.path);
        if (request.path === "/api/v2/room/join/share/by_code") {
          return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-room-token", {})));
        }
        if (request.path === "/api/v2/room/share/cancel_remote_assist") {
          return jsonResponse(proxyResponse({ code: 0, msg: "ok" }));
        }
        return jsonResponse({});
      }),
    );

    await expect(joinRemoteAssistanceByCode({ connectId: "982123456", connectCode: "L6026CCD" })).rejects.toThrow(
      "伙伴设备未返回设备系统，已取消本次远程协助",
    );
    expect(requestedPaths).toEqual(["/api/v2/room/join/share/by_code", "/api/v2/room/share/cancel_remote_assist"]);
    expect(window.sessionStorage.getItem("uurc.latestRoomSession")).toBeNull();
  });

  it("reports when automatic assistance cancellation fails at the HTTP layer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu") return jsonResponse({});
        if (request.path === "/api/v2/room/join/share/by_code") {
          return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-room-token", {})));
        }
        return jsonResponse({
          status: 500,
          statusText: "Internal Server Error",
          headers: { "content-type": "application/json" },
          body: { msg: "cancel failed" },
        });
      }),
    );

    await expect(joinRemoteAssistanceByCode({ connectId: "982123456", connectCode: "L6026CCD" })).rejects.toThrow(
      "伙伴设备未返回设备系统，自动取消协助失败，请让伙伴端结束本次协助后重试",
    );
    expect(window.sessionStorage.getItem("uurc.latestRoomSession")).toBeNull();
  });

  it("ignores invalid and unrelated nested platform values", async () => {
    const requestedPaths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu") return jsonResponse({});
        requestedPaths.push(request.path);
        if (request.path === "/api/v2/room/join/share/by_code") {
          return jsonResponse(
            proxyResponse({
              code: 0,
              data: {
                publisher_platform: 0,
                metadata: { platform: 4 },
                room_config: { token: "malformed-room-without-signal-server" },
              },
            }),
          );
        }
        return jsonResponse(proxyResponse({ code: 0, msg: "ok" }));
      }),
    );

    await expect(joinRemoteAssistanceByCode({ connectId: "982123456", connectCode: "L6026CCD" })).rejects.toThrow(
      "伙伴设备未返回设备系统，已取消本次远程协助",
    );
    expect(requestedPaths).toEqual(["/api/v2/room/join/share/by_code", "/api/v2/room/share/cancel_remote_assist"]);
    expect(window.sessionStorage.getItem("uurc.latestRoomSession")).toBeNull();
  });

  it("keeps waiting for confirmation when an intermediate response has no room or platform", async () => {
    const requestedPaths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu") return jsonResponse({});
        requestedPaths.push(request.path);
        return jsonResponse(proxyResponse({ code: 0x470, msg: "confirmation required" }));
      }),
    );

    await expect(
      joinRemoteAssistanceByCode({ connectId: "982123456", connectCode: "L6026CCD" }),
    ).resolves.toMatchObject({
      roomConfigSummary: null,
      assistance: { confirmationRequired: true, targetPlatform: undefined },
    });
    expect(requestedPaths).toEqual(["/api/v2/room/join/share/by_code"]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function proxyResponse(body: unknown) {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body,
  };
}

function remoteAssistanceRoomBody(
  token: string,
  platformFields: Record<string, number> = { publisher_platform: 4, device_platform: 2, platform: 1 },
) {
  return {
    code: 0,
    data: {
      control_id: "control-1",
      device_name: "Partner PC",
      ...platformFields,
      room_config: {
        token,
        signaling_server: "wss://assist.example",
        ws_connect_timeout_ms: 12000,
        streamer_retry_delta_ms: 900,
        report_token: "assist-report-token",
        report_url: "https://report.example/qos",
      },
    },
  };
}
