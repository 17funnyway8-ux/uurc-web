import { pushInt32Field, pushMessageField, pushStringField, pushVarintField } from "./internal/protobufWire.js";

export const STREAMER_ROOM_CONFIG_FIELDS = [
  "token",
  "signalServers",
  "timeout",
  "signalReconnectDelay",
  "reportToken",
  "reportUrl",
  "reportServerAddress",
] as const;

export interface StreamerConnectOptionsField {
  tag: number;
  name: string;
  repeated: boolean;
}

export const STREAMER_CONNECT_OPTIONS_FIELDS = [
  { tag: 1, name: "capture_type", repeated: false },
  { tag: 2, name: "type_value", repeated: false },
  { tag: 3, name: "capture_params", repeated: false },
  { tag: 4, name: "decoder_cap_list", repeated: true },
  { tag: 5, name: "force_virtual_display", repeated: false },
  { tag: 6, name: "virtual_display_modes", repeated: true },
  { tag: 7, name: "virtual_display_init_resolution", repeated: false },
  { tag: 8, name: "client_type", repeated: false },
  { tag: 9, name: "device_id", repeated: false },
  { tag: 10, name: "control_connect_type", repeated: false },
  { tag: 11, name: "feature_flag", repeated: false },
  { tag: 12, name: "client_version", repeated: false },
] as const satisfies readonly StreamerConnectOptionsField[];

export const STREAMER_CAPTURE_TYPES = {
  CT_UNKNOWN: 0,
  CT_DESKTOP: 1,
  CT_WINDOW: 2,
  CT_MUMU: 3,
  CT_HOOK: 4,
  CT_FILETRANSFER: 5,
  CT_SECOND_SCREEN: 6,
  CT_QUICKLAUNCH: 7,
  CT_TERMINAL: 8,
} as const;

export const STREAMER_CONTROL_CONNECT_TYPES = {
  ControlConnectType_UNKNOWN: 0,
  ControlConnectType_Normal: 1,
  ControlConnectType_Assistance: 2,
} as const;

export const STREAMER_CLIENT_TYPES = {
  Client_UNSPECIFIED: 0,
  Client_IOS: 1,
  Client_ANDROID: 2,
  Client_WINDOWS: 3,
  Client_MAC: 4,
} as const;

export const STREAMER_APP_CLIENT_VERSION = "4.23.0" as const;

export interface StreamerFeatureFlagField {
  tag: number;
  name: string;
}

export const STREAMER_FEATURE_FLAG_FIELDS = [
  { tag: 1, name: "ff_capture_setting" },
  { tag: 2, name: "ff_simple_action" },
  { tag: 3, name: "ff_system_metrics" },
  { tag: 4, name: "ff_private_screen" },
  { tag: 5, name: "ff_update_acquire" },
  { tag: 6, name: "ff_file_transfer_ftp" },
  { tag: 7, name: "ff_file_transfer_ftp2" },
  { tag: 8, name: "ff_clipboard" },
  { tag: 9, name: "ff_qos_stat" },
  { tag: 10, name: "ff_mumu_control" },
  { tag: 11, name: "ff_virtual_mouse_device" },
] as const satisfies readonly StreamerFeatureFlagField[];

export const STREAMER_DEFAULT_FEATURE_FLAGS = {
  ff_capture_setting: 2,
  ff_simple_action: 1,
  ff_system_metrics: 2,
  ff_private_screen: 2,
  ff_update_acquire: 0,
  ff_file_transfer_ftp: 2,
  ff_file_transfer_ftp2: 2,
  ff_clipboard: 3,
  ff_qos_stat: 0,
  ff_mumu_control: 0,
  ff_virtual_mouse_device: 0,
} as const;

export const STREAMER_DEFAULT_BROWSER_VIRTUAL_DISPLAY_MODE = {
  width: 1920,
  height: 1080,
  fps: 60,
} as const;

export const STREAMER_DEFAULT_BROWSER_LOCAL_RESOLUTION = {
  width: 1920,
  height: 1080,
} as const;

export const STREAMER_DEFAULT_BROWSER_TYPE_VALUE = -1;

export interface StreamerCaptureParamField {
  tag: number;
  name: string;
  defaultValue: string | number | boolean | null;
}

export const STREAMER_CAPTURE_PARAM_FIELDS = [
  { tag: 1, name: "fps", defaultValue: "FPS_UNKNOWN" },
  { tag: 2, name: "video_quality", defaultValue: "VideoQuality_UNKNOWN" },
  { tag: 3, name: "cursor_capture", defaultValue: false },
  { tag: 4, name: "choose_resolution_type", defaultValue: "ChooseType_UNKNOWN" },
  { tag: 5, name: "local_resolution", defaultValue: null },
  { tag: 6, name: "choose_resolution", defaultValue: null },
  { tag: 7, name: "chroma_format", defaultValue: "ChromaFormat_UNKNOWN" },
  { tag: 8, name: "max_custom_bitrate", defaultValue: 0 },
  { tag: 9, name: "enable_hdr", defaultValue: false },
  { tag: 10, name: "auto_frame_quality", defaultValue: "VideoQuality_UNKNOWN" },
  { tag: 11, name: "fpsCount", defaultValue: 0 },
] as const satisfies readonly StreamerCaptureParamField[];

export const STREAMER_SCREEN_RESOLUTION_FIELDS = [
  { tag: 1, name: "width", defaultValue: 0 },
  { tag: 2, name: "height", defaultValue: 0 },
] as const;

export const STREAMER_FPS_VALUES = {
  FPS_UNKNOWN: 0,
  FPS_30: 1,
  FPS_60: 2,
  FPS_90: 3,
  FPS_144: 4,
} as const;

export const STREAMER_VIDEO_QUALITY_VALUES = {
  VideoQuality_UNKNOWN: 0,
  VideoQuality_Fast: 1,
  VideoQuality_General: 2,
  VideoQuality_HD: 3,
  VideoQuality_Bluray: 4,
  VideoQuality_Auto: 5,
  VideoQuality_Custom: 6,
} as const;

export const STREAMER_CHOOSE_RESOLUTION_TYPES = {
  ChooseType_UNKNOWN: 0,
  ChooseType_DEFAULT: 1,
  ChooseType_FOLLOW_LOCAL: 2,
  ChooseType_FOLLOW_REMOTE: 3,
  ChooseType_RESOLUTION: 4,
} as const;

export const STREAMER_CHROMA_FORMATS = {
  ChromaFormat_UNKNOWN: 0,
  ChromaFormat_420: 1,
  ChromaFormat_422: 2,
  ChromaFormat_444: 3,
  ChromaFormat_400: 4,
} as const;

export const STREAMER_VIDEO_CODECS = {
  Unknown: 0,
  H264: 1,
  H265: 2,
  VP8: 3,
  VP9: 4,
  AV1: 5,
} as const;

export const STREAMER_DECODER_CAP_FIELDS = [
  { tag: 1, name: "fps", defaultValue: 0 },
  { tag: 2, name: "codec_type", defaultValue: "CodecType_UNKNOWN" },
  { tag: 3, name: "resolution_width", defaultValue: 0 },
  { tag: 4, name: "resolution_height", defaultValue: 0 },
  { tag: 5, name: "chroma_format", defaultValue: "ChromaFormat_UNKNOWN" },
] as const;

export const STREAMER_DECODER_CODEC_TYPES = {
  CodecType_UNKNOWN: 0,
  CodecType_H264: 1,
  CodecType_H265: 2,
} as const;

export const STREAMER_DECODER_CHROMA_FORMATS = {
  ChromaFormat_UNKNOWN: 0,
  ChromaFormat_420: 1,
  ChromaFormat_422: 2,
  ChromaFormat_444: 3,
  ChromaFormat_400: 4,
} as const;

export const STREAMER_CAPTURE_PARAM_DEFAULTS = {
  fps: "FPS_UNKNOWN",
  videoQuality: "VideoQuality_UNKNOWN",
  cursorCapture: false,
  chooseResolutionType: "ChooseType_UNKNOWN",
  localResolution: null,
  chooseResolution: null,
  chromaFormat: "ChromaFormat_UNKNOWN",
  maxCustomBitrate: 0,
  enableHdr: false,
  autoFrameQuality: "VideoQuality_UNKNOWN",
  fpsCount: 0,
} as const;

export interface StreamerScreenResolutionInput {
  width: number;
  height: number;
}

export interface StreamerVirtualDisplayModeInput extends StreamerScreenResolutionInput {
  fps?: number;
}

export interface EncodeStreamerCaptureParamsInput {
  fps?: number;
  videoQuality?: number;
  cursorCapture?: boolean;
  chooseResolutionType?: number;
  localResolution?: StreamerScreenResolutionInput | null;
  chooseResolution?: StreamerScreenResolutionInput | null;
  chromaFormat?: number;
  maxCustomBitrate?: number;
  enableHdr?: boolean;
  autoFrameQuality?: number;
  fpsCount?: number;
}

export interface EncodeStreamerDecoderCapInput {
  fps?: number;
  codecType?: number;
  width?: number;
  height?: number;
  chromaFormat?: number;
}

export type StreamerFeatureFlagsInput = Partial<Record<(typeof STREAMER_FEATURE_FLAG_FIELDS)[number]["name"], number>>;

export interface EncodeStreamerConnectOptionsInput {
  captureType?: number;
  typeValue?: number;
  captureParams?: EncodeStreamerCaptureParamsInput | null;
  decoderCapList?: readonly Uint8Array[];
  forceVirtualDisplay?: boolean;
  virtualDisplayModes?: readonly StreamerVirtualDisplayModeInput[];
  virtualDisplayInitResolution?: StreamerScreenResolutionInput | null;
  clientType?: number;
  deviceId: string;
  controlConnectType?: number;
  featureFlags?: StreamerFeatureFlagsInput | null;
  clientVersion?: string;
}

export interface BuildDefaultStreamerConnectOptionsBase64Input {
  deviceId: string;
  controlConnectType?: number;
  fps?: number;
  videoQuality?: number;
  cursorCapture?: boolean;
  localResolution?: StreamerScreenResolutionInput | null;
  virtualDisplayModes?: readonly StreamerVirtualDisplayModeInput[];
}

export function encodeStreamerConnectOptions(input: EncodeStreamerConnectOptionsInput): Uint8Array {
  const bytes: number[] = [];
  const captureType = input.captureType ?? STREAMER_CAPTURE_TYPES.CT_DESKTOP;
  const typeValue = input.typeValue ?? 0;
  const clientType = input.clientType ?? STREAMER_CLIENT_TYPES.Client_ANDROID;
  const controlConnectType = input.controlConnectType ?? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal;
  const clientVersion = input.clientVersion ?? STREAMER_APP_CLIENT_VERSION;

  if (captureType !== STREAMER_CAPTURE_TYPES.CT_UNKNOWN) pushVarintField(bytes, 1, captureType);
  if (typeValue !== 0) pushInt32Field(bytes, 2, typeValue);

  const captureParamsBytes =
    input.captureParams === null ? new Uint8Array() : encodeStreamerCaptureParams(input.captureParams ?? {});
  if (captureParamsBytes.length > 0) pushMessageField(bytes, 3, captureParamsBytes);

  for (const decoderCap of input.decoderCapList ?? []) {
    pushMessageField(bytes, 4, decoderCap);
  }
  if (input.forceVirtualDisplay) pushVarintField(bytes, 5, 1);
  for (const mode of input.virtualDisplayModes ?? []) {
    pushMessageField(bytes, 6, encodeStreamerVirtualDisplayMode(mode));
  }
  if (input.virtualDisplayInitResolution) {
    pushMessageField(bytes, 7, encodeStreamerScreenResolution(input.virtualDisplayInitResolution));
  }
  if (clientType !== STREAMER_CLIENT_TYPES.Client_UNSPECIFIED) pushVarintField(bytes, 8, clientType);
  if (input.deviceId.length > 0) pushStringField(bytes, 9, input.deviceId);
  if (controlConnectType !== STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_UNKNOWN) {
    pushVarintField(bytes, 10, controlConnectType);
  }

  const featureFlagBytes = encodeStreamerFeatureFlags(input.featureFlags ?? STREAMER_DEFAULT_FEATURE_FLAGS);
  if (featureFlagBytes.length > 0) pushMessageField(bytes, 11, featureFlagBytes);
  if (clientVersion.length > 0) pushStringField(bytes, 12, clientVersion);

  return new Uint8Array(bytes);
}

export function buildDefaultStreamerConnectOptionsBase64(input: BuildDefaultStreamerConnectOptionsBase64Input): string {
  const bytes = encodeStreamerConnectOptions({
    deviceId: input.deviceId,
    captureType: STREAMER_CAPTURE_TYPES.CT_DESKTOP,
    typeValue: STREAMER_DEFAULT_BROWSER_TYPE_VALUE,
    captureParams: {
      fps: input.fps ?? STREAMER_FPS_VALUES.FPS_60,
      videoQuality: input.videoQuality ?? STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_HD,
      cursorCapture: input.cursorCapture ?? true,
      chooseResolutionType: STREAMER_CHOOSE_RESOLUTION_TYPES.ChooseType_DEFAULT,
      localResolution: input.localResolution ?? STREAMER_DEFAULT_BROWSER_LOCAL_RESOLUTION,
    },
    decoderCapList: [buildDefaultStreamerDecoderCap()],
    virtualDisplayModes: input.virtualDisplayModes ?? [STREAMER_DEFAULT_BROWSER_VIRTUAL_DISPLAY_MODE],
    clientType: STREAMER_CLIENT_TYPES.Client_ANDROID,
    controlConnectType: input.controlConnectType ?? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal,
    featureFlags: STREAMER_DEFAULT_FEATURE_FLAGS,
    clientVersion: STREAMER_APP_CLIENT_VERSION,
  });
  return encodeBase64(bytes);
}

export function buildDefaultStreamerDecoderCap(): Uint8Array {
  return encodeStreamerDecoderCap({
    fps: 60,
    codecType: STREAMER_DECODER_CODEC_TYPES.CodecType_H264,
    width: 3840,
    height: 2160,
    chromaFormat: STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_420,
  });
}

export function encodeStreamerDecoderCap(input: EncodeStreamerDecoderCapInput): Uint8Array {
  const bytes: number[] = [];
  if (input.fps) pushInt32Field(bytes, 1, input.fps);
  const codecType = input.codecType ?? STREAMER_DECODER_CODEC_TYPES.CodecType_UNKNOWN;
  if (codecType !== STREAMER_DECODER_CODEC_TYPES.CodecType_UNKNOWN) pushVarintField(bytes, 2, codecType);
  if (input.width) pushInt32Field(bytes, 3, input.width);
  if (input.height) pushInt32Field(bytes, 4, input.height);
  const chromaFormat = input.chromaFormat ?? STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_UNKNOWN;
  if (chromaFormat !== STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_UNKNOWN) pushVarintField(bytes, 5, chromaFormat);
  return new Uint8Array(bytes);
}

function encodeStreamerCaptureParams(input: EncodeStreamerCaptureParamsInput): Uint8Array {
  const bytes: number[] = [];
  if (input.fps && input.fps !== STREAMER_FPS_VALUES.FPS_UNKNOWN) pushVarintField(bytes, 1, input.fps);
  if (input.videoQuality && input.videoQuality !== STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_UNKNOWN) {
    pushVarintField(bytes, 2, input.videoQuality);
  }
  if (input.cursorCapture) pushVarintField(bytes, 3, 1);
  if (
    input.chooseResolutionType &&
    input.chooseResolutionType !== STREAMER_CHOOSE_RESOLUTION_TYPES.ChooseType_UNKNOWN
  ) {
    pushVarintField(bytes, 4, input.chooseResolutionType);
  }
  if (input.localResolution) pushMessageField(bytes, 5, encodeStreamerScreenResolution(input.localResolution));
  if (input.chooseResolution) pushMessageField(bytes, 6, encodeStreamerScreenResolution(input.chooseResolution));
  if (input.chromaFormat && input.chromaFormat !== STREAMER_CHROMA_FORMATS.ChromaFormat_UNKNOWN) {
    pushVarintField(bytes, 7, input.chromaFormat);
  }
  if (input.maxCustomBitrate) pushInt32Field(bytes, 8, input.maxCustomBitrate);
  if (input.enableHdr) pushVarintField(bytes, 9, 1);
  if (input.autoFrameQuality && input.autoFrameQuality !== STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_UNKNOWN) {
    pushVarintField(bytes, 10, input.autoFrameQuality);
  }
  if (input.fpsCount) pushInt32Field(bytes, 11, input.fpsCount);
  return new Uint8Array(bytes);
}

function encodeStreamerScreenResolution(input: StreamerScreenResolutionInput): Uint8Array {
  const bytes: number[] = [];
  if (input.width) pushInt32Field(bytes, 1, input.width);
  if (input.height) pushInt32Field(bytes, 2, input.height);
  return new Uint8Array(bytes);
}

function encodeStreamerVirtualDisplayMode(input: StreamerVirtualDisplayModeInput): Uint8Array {
  const bytes: number[] = [];
  if (input.width) pushInt32Field(bytes, 1, input.width);
  if (input.height) pushInt32Field(bytes, 2, input.height);
  if (input.fps) pushInt32Field(bytes, 3, input.fps);
  return new Uint8Array(bytes);
}

function encodeStreamerFeatureFlags(input: StreamerFeatureFlagsInput): Uint8Array {
  const bytes: number[] = [];
  for (const field of STREAMER_FEATURE_FLAG_FIELDS) {
    const value = input[field.name] ?? 0;
    if (value) pushInt32Field(bytes, field.tag, value);
  }
  return new Uint8Array(bytes);
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    output += b === undefined ? "=" : alphabet[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    output += c === undefined ? "=" : alphabet[c & 0x3f];
  }
  return output;
}
