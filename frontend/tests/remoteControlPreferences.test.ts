import { describe, expect, it } from "vitest";

import {
  DEFAULT_STREAMER_FPS,
  DEFAULT_STREAMER_VIDEO_QUALITY,
  isStreamerFps,
  isStreamerVideoQuality,
  toProtocolFpsValue,
  toProtocolVideoQualityValue,
} from "../src/remote/remoteControlPreferences.js";

describe("remoteControlPreferences", () => {
  describe("isStreamerFps", () => {
    it("accepts the supported frame-rate strings", () => {
      expect(isStreamerFps("30")).toBe(true);
      expect(isStreamerFps("60")).toBe(true);
      expect(isStreamerFps("90")).toBe(true);
      expect(isStreamerFps("144")).toBe(true);
    });

    it("rejects unknown, empty, and non-string values", () => {
      expect(isStreamerFps("120")).toBe(false);
      expect(isStreamerFps("")).toBe(false);
      expect(isStreamerFps(null)).toBe(false);
      expect(isStreamerFps(undefined)).toBe(false);
    });
  });

  describe("isStreamerVideoQuality", () => {
    it("accepts the supported quality strings", () => {
      expect(isStreamerVideoQuality("fast")).toBe(true);
      expect(isStreamerVideoQuality("general")).toBe(true);
      expect(isStreamerVideoQuality("hd")).toBe(true);
      expect(isStreamerVideoQuality("bluray")).toBe(true);
      expect(isStreamerVideoQuality("auto")).toBe(true);
    });

    it("rejects unknown and empty values", () => {
      expect(isStreamerVideoQuality("4k")).toBe(false);
      expect(isStreamerVideoQuality("")).toBe(false);
      expect(isStreamerVideoQuality(null)).toBe(false);
    });
  });

  describe("toProtocolFpsValue", () => {
    it("maps readable fps to the UU protocol enum values", () => {
      expect(toProtocolFpsValue("30")).toBe(1); // FPS_30
      expect(toProtocolFpsValue("60")).toBe(2); // FPS_60
      expect(toProtocolFpsValue("90")).toBe(3); // FPS_90
      expect(toProtocolFpsValue("144")).toBe(4); // FPS_144
    });
  });

  describe("toProtocolVideoQualityValue", () => {
    it("maps readable quality to the UU protocol enum values", () => {
      expect(toProtocolVideoQualityValue("fast")).toBe(1); // VideoQuality_Fast
      expect(toProtocolVideoQualityValue("general")).toBe(2); // VideoQuality_General
      expect(toProtocolVideoQualityValue("hd")).toBe(3); // VideoQuality_HD
      expect(toProtocolVideoQualityValue("bluray")).toBe(4); // VideoQuality_Bluray
      expect(toProtocolVideoQualityValue("auto")).toBe(5); // VideoQuality_Auto
    });
  });

  describe("defaults", () => {
    it("keeps the protocol-compatible defaults", () => {
      expect(DEFAULT_STREAMER_FPS).toBe("60"); // matches FPS_60
      expect(DEFAULT_STREAMER_VIDEO_QUALITY).toBe("hd"); // matches VideoQuality_HD
    });
  });
});
