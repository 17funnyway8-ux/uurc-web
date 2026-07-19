import { STREAMER_CHROMA_FORMATS, STREAMER_VIDEO_CODECS } from "./connectOptions.js";
import { asRecord } from "./internal/unknown.js";

export const STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS = ["control_id", "device_capability"] as const;
export const STREAMER_DEVICE_CAPABILITY_JSON_KEYS = ["display_info", "video_codec_capability", "ice_id"] as const;
export const STREAMER_DISPLAY_INFO_KEYS = ["id", "fps", "type", "hdr"] as const;
export const STREAMER_VIDEO_CODEC_CAPABILITY_KEYS = [
  "video_codec",
  "width",
  "height",
  "chroma_sampling",
  "bit_depth",
  "codec_impl",
] as const;

export interface BuildStreamerControlStreamerDataJsonInput {
  controlId: string;
  iceId?: string;
  deviceCapability?: unknown;
}

export interface StreamerDisplayInfoCapability {
  id: number;
  fps: number;
  type: number;
  hdr: number;
}

export interface StreamerVideoCodecCapability {
  video_codec: number;
  width: number;
  height: number;
  chroma_sampling: number;
  bit_depth: number;
  codec_impl: number;
}

export interface StreamerDeviceCapability {
  display_info: StreamerDisplayInfoCapability[];
  video_codec_capability: StreamerVideoCodecCapability[];
  ice_id: string;
}

export const STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY: StreamerDeviceCapability = {
  display_info: [
    {
      id: 0,
      fps: 60,
      type: 0,
      hdr: -1,
    },
  ],
  video_codec_capability: [
    {
      video_codec: STREAMER_VIDEO_CODECS.H264,
      width: 3840,
      height: 2160,
      chroma_sampling: STREAMER_CHROMA_FORMATS.ChromaFormat_420,
      bit_depth: 8,
      codec_impl: -1,
    },
  ],
  ice_id: "",
};

export function buildStreamerBrowserDeviceCapability(): StreamerDeviceCapability {
  return {
    display_info: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.display_info.map((item) => ({ ...item })),
    video_codec_capability: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.video_codec_capability.map((item) => ({
      ...item,
    })),
    ice_id: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.ice_id,
  };
}

export function buildStreamerControlStreamerDataJson(input: BuildStreamerControlStreamerDataJsonInput): string {
  return JSON.stringify({
    control_id: input.controlId,
    device_capability: buildStreamerControlDeviceCapability(input),
  });
}

function buildStreamerControlDeviceCapability(input: BuildStreamerControlStreamerDataJsonInput): unknown {
  const capability = input.deviceCapability ?? buildStreamerBrowserDeviceCapability();
  if (!input.iceId) return capability;

  const record = asRecord(capability);
  return record ? { ...record, ice_id: input.iceId } : capability;
}
