import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";

import { LandingPage } from "../src/components/LandingPage.js";

describe("LandingPage", () => {
  afterEach(cleanup);

  it("sends signed-in visitors to their devices", () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage loggedIn />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "UU 远程桌面网页版" })).toBeInTheDocument();
    expect(screen.getByText(/UU 远程桌面 Web 版主控端/)).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: /进入控制台/ })) {
      expect(link).toHaveAttribute("href", "/devices");
    }
    expect(screen.getByRole("img", { name: "UU Remote Web 手机号验证码登录页面" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "UU Remote Web 设备列表页面" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "UU Remote Web 远程控制会话页面" })).toBeInTheDocument();
    expect(container.querySelector(".landing-hero img")).not.toBeInTheDocument();
    expect(container.querySelector(".landing-signal-field")).not.toBeInTheDocument();
  });

  it("sends signed-out visitors to login", () => {
    render(
      <MemoryRouter>
        <LandingPage loggedIn={false} />
      </MemoryRouter>,
    );

    for (const link of screen.getAllByRole("link", { name: /进入控制台/ })) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });
});
