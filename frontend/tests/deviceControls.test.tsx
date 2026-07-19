import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeviceList } from "../src/components/DeviceControls.js";

describe("DeviceList", () => {
  it("only exposes a connect action for controllable non-local online devices", async () => {
    const onSelect = vi.fn();
    const onConnect = vi.fn();
    const user = userEvent.setup();

    render(
      <DeviceList
        devices={{
          desktopDevices: [
            { deviceId: "mac-1", alias: "Office Mac", controllable: true, status: "CONNECTED", raw: {} },
            { deviceId: "web-device-1", alias: "本机控制端", controllable: true, status: "CONNECTED", raw: {} },
          ],
          mobileDevices: [{ deviceId: "phone-1", alias: "iPhone 17", controllable: false, status: "OFFLINE", raw: {} }],
          tvDevices: [],
        }}
        currentDeviceId="web-device-1"
        onSelect={onSelect}
        onConnect={onConnect}
      />,
    );

    expect(screen.getByRole("button", { name: /连接 Office Mac/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 iPhone 17/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 本机控制端/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /连接 Office Mac/ }));
    expect(onSelect).toHaveBeenCalledWith("mac-1");
    expect(onConnect).toHaveBeenCalledWith("mac-1");
  });
});
