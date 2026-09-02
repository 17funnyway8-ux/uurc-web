// 画质/帧率偏好：前端可读字符串值 -> UU 协议枚举数值的单一事实源。
// 存储形式使用可读字符串以便持久化与调试；透传给协议层时转换为数字。

export const STREAMER_FPS_OPTIONS = ["30", "60", "90", "144"] as const;
export type StreamerFps = (typeof STREAMER_FPS_OPTIONS)[number];

export const STREAMER_VIDEO_QUALITY_OPTIONS = ["fast", "general", "hd", "bluray", "auto"] as const;
export type StreamerVideoQuality = (typeof STREAMER_VIDEO_QUALITY_OPTIONS)[number];

export const DEFAULT_STREAMER_FPS: StreamerFps = "60";
export const DEFAULT_STREAMER_VIDEO_QUALITY: StreamerVideoQuality = "hd";

// 与 shared/src/streamer/internal/connectOptionsSchema.ts 的协议枚举保持一致：
// STREAMER_FPS_VALUES = { FPS_UNKNOWN:0, FPS_30:1, FPS_60:2, FPS_90:3, FPS_144:4 }
// STREAMER_VIDEO_QUALITY_VALUES = { UNKNOWN:0, Fast:1, General:2, HD:3, Bluray:4, Auto:5 }
const STREAMER_FPS_PROTOCOL_VALUES: Record<StreamerFps, number> = {
  "30": 1,
  "60": 2,
  "90": 3,
  "144": 4,
} as const;

const STREAMER_VIDEO_QUALITY_PROTOCOL_VALUES: Record<StreamerVideoQuality, number> = {
  fast: 1,
  general: 2,
  hd: 3,
  bluray: 4,
  auto: 5,
} as const;

export function isStreamerFps(value: string | null | undefined): value is StreamerFps {
  return !!value && (STREAMER_FPS_OPTIONS as readonly string[]).includes(value);
}

export function isStreamerVideoQuality(value: string | null | undefined): value is StreamerVideoQuality {
  return !!value && (STREAMER_VIDEO_QUALITY_OPTIONS as readonly string[]).includes(value);
}

/** 前端偏好字符串 -> 协议 fps 数值；非法输入回退到 60（协议 FPS_60=2）。 */
export function toProtocolFpsValue(fps: StreamerFps): number {
  return STREAMER_FPS_PROTOCOL_VALUES[fps];
}

/** 前端偏好字符串 -> 协议 video_quality 数值；非法输入回退到 HD（协议 HD=3）。 */
export function toProtocolVideoQualityValue(quality: StreamerVideoQuality): number {
  return STREAMER_VIDEO_QUALITY_PROTOCOL_VALUES[quality];
}

/** 帧率偏好对应的中文文案。 */
export const STREAMER_FPS_LABELS: Record<StreamerFps, string> = {
  "30": "30 帧",
  "60": "60 帧",
  "90": "90 帧",
  "144": "144 帧",
};

/** 画质偏好对应的中文文案。 */
export const STREAMER_VIDEO_QUALITY_LABELS: Record<StreamerVideoQuality, string> = {
  fast: "流畅",
  general: "均衡",
  hd: "高清",
  bluray: "蓝光",
  auto: "自动",
};
