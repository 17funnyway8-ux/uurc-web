import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "../src/components/Toast.js";
import { rectFrom } from "./appTestValues.js";

describe("Toast", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("places remote feedback above a toolbar docked at the bottom of the stage", async () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.classList.contains("control-stage-frame")) {
        return rectFrom({ left: 0, top: 48, width: 1122, height: 752 });
      }
      if (this.classList.contains("control-command-bar")) {
        return rectFrom({ left: 522, top: 743, width: 592, height: 49 });
      }
      if (this.classList.contains("app-toast")) {
        return rectFrom({ left: 480, top: 720, width: 240, height: 40 });
      }
      return rectFrom({ left: 0, top: 0, width: 0, height: 0 });
    });

    render(
      <>
        <div className="control-stage-frame">
          <div className="control-command-bar" />
        </div>
        <Toast toast={{ id: 1, message: "剪贴板已同步到远端" }} onDismiss={vi.fn()} placement="remote" />
      </>,
    );

    const toast = screen.getByRole("status");
    await waitFor(() => {
      expect(toast).toHaveClass("app-toast--positioned");
      expect(toast).toHaveStyle({ bottom: "auto", left: "698px", top: "695px", transform: "none" });
    });
  });

  it("uses the least-overlapping bounded position when the stage is too short", async () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 100);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.classList.contains("control-stage-frame")) {
        return rectFrom({ left: 0, top: 0, width: 320, height: 100 });
      }
      if (this.classList.contains("control-command-bar")) {
        return rectFrom({ left: 8, top: 25, width: 304, height: 49 });
      }
      if (this.classList.contains("app-toast")) {
        return rectFrom({ left: 80, top: 30, width: 160, height: 40 });
      }
      return rectFrom({ left: 0, top: 0, width: 0, height: 0 });
    });

    render(
      <>
        <div className="control-stage-frame">
          <div className="control-command-bar" />
        </div>
        <Toast toast={{ id: 1, message: "已断开远控连接" }} onDismiss={vi.fn()} placement="remote" />
      </>,
    );

    const toast = screen.getByRole("status");
    await waitFor(() => {
      expect(toast).toHaveClass("app-toast--positioned");
      expect(toast).toHaveStyle({ left: "80px", top: "52px" });
    });
  });
});
