import { asRecord, assignOptionalBoolean, assignOptionalNumber, assignOptionalString } from "./internal/unknown.js";

export const STREAMER_SOAC_EVENT = "soac" as const;
export const STREAMER_SOAC_TYPES = ["offer", "answer", "candidate", "restart_ice"] as const;
export type StreamerSoacType = (typeof STREAMER_SOAC_TYPES)[number];
export const STREAMER_CONTROLLER_OUTBOUND_SOAC_TYPES = ["offer", "candidate", "restart_ice"] as const;
export const STREAMER_CONTROLLER_INBOUND_SOAC_TYPES = ["answer", "candidate", "restart_ice"] as const;
export const STREAMER_ICE_NETWORK_TYPES = {
  eth: 1,
  wlan: 2,
  v4Wlan: 2,
  appAuto: 3,
  mobile: 4,
  vpn: 8,
  loopback: 16,
} as const;
export type StreamerIceNetworkType = (typeof STREAMER_ICE_NETWORK_TYPES)[keyof typeof STREAMER_ICE_NETWORK_TYPES];

export const STREAMER_CONTROLLER_SIGNAL_EVENTS = [
  STREAMER_SOAC_EVENT,
  "streamer_push",
  "forward_setting",
  "device_capability",
] as const;

export const STREAMER_SIGNAL_SOCKET_EVENTS = {
  control: "control",
  leave: "leave",
  bmsgPush: "bmsg_push",
  publisherDisconnect: "publisher_disconnect",
} as const;

export const STREAMER_CONTROL_EVENT_NAME = STREAMER_SIGNAL_SOCKET_EVENTS.control;
export const STREAMER_CONTROL_EVENT_PAYLOAD_KEYS = ["app_control_id", "app_data", "streamer_data"] as const;
export const STREAMER_CONTROL_EVENT_PAYLOAD_TYPES = {
  app_control_id: "string",
  app_data: "binary",
  streamer_data: "string",
} as const;
export const STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER = ["app_control_id", "app_data", "streamer_data"] as const;
export const STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS = 10000;
export const STREAMER_CONTROL_RESULT_KEYS = [
  "client_id",
  "ice_id",
  "iceServers",
  "app_data",
  "streamer_data",
  "app_control_id",
  "controller_platform",
  "force_relay",
  "auto_switch_network",
  "relay_ins_type",
  "force_auto_switch_pkt_loss",
  "force_auto_switch_latency",
  "possible_auto_switch_pkt_loss",
  "possible_auto_switch_latency",
  "code",
  "msg",
] as const;
export const STREAMER_CONTROL_RESULT_ICE_SERVER_KEYS = ["urls", "username", "credential"] as const;

export const STREAMER_SIGNAL_HEADER_KEYS = [
  "X-NRD-AUTH",
  "X-NRD-CONTROLLING",
  "streamer_version",
  "streamer_flag",
] as const;

export const STREAMER_CLIENT_VERSION = "V3.1.14" as const;

export const STREAMER_DEFAULT_SIGNAL_HEADER_VALUES = {
  "X-NRD-CONTROLLING": "0",
  streamer_version: STREAMER_CLIENT_VERSION,
} as const;

export interface StreamerFlagHeaderOptions {
  gzipSdp: boolean;
}

export interface BuildStreamerSignalHeadersInput {
  token: string;
  gzipSdp?: boolean;
}

export function buildStreamerFlagHeader(options: StreamerFlagHeaderOptions): string {
  return JSON.stringify({ sdp_flags: { gzip_sdp: options.gzipSdp } });
}

export function buildStreamerSignalHeaders(input: BuildStreamerSignalHeadersInput): Record<string, string> {
  return {
    "X-NRD-AUTH": input.token,
    ...STREAMER_DEFAULT_SIGNAL_HEADER_VALUES,
    streamer_flag: buildStreamerFlagHeader({ gzipSdp: input.gzipSdp ?? true }),
  };
}

export const STREAMER_SOAC_PAYLOAD_KEYS = [
  "type",
  "sdp",
  "ice_id",
  "app_control_id",
  "gzip_sdp",
  "ice_network_type",
  "candidate",
  "sdpMid",
  "sdpMLineIndex",
] as const;

export const STREAMER_SOAC_MESSAGE_KEYS = ["client_id", "data"] as const;

export interface StreamerSoacCandidatePayload {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface StreamerControlIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface StreamerRtcConfiguration {
  iceServers: StreamerControlIceServer[];
  iceTransportPolicy: "all" | "relay";
}

export interface StreamerControlPeerNetworkInfo {
  country?: string;
  province?: string;
  city?: string;
  isp?: string;
  relayIsp?: string;
}

export interface StreamerSignalControlResult {
  clientId?: string;
  iceId?: string;
  appControlId?: string;
  code?: number;
  msg?: string;
  appDataBase64?: string;
  streamerData?: string;
  controllerPlatform?: number;
  forceRelay?: boolean;
  autoSwitchNetwork?: boolean;
  relayInsType?: number;
  forceAutoSwitchPacketLoss?: number;
  forceAutoSwitchLatency?: number;
  possibleAutoSwitchPacketLoss?: number;
  possibleAutoSwitchLatency?: number;
  iceServers: StreamerControlIceServer[];
  publisher?: StreamerControlPeerNetworkInfo;
  subscriber?: StreamerControlPeerNetworkInfo;
}

export interface StreamerSignalControlAck {
  ackStatus?: string;
  result?: StreamerSignalControlResult;
}

export interface StreamerSignalControlFailure {
  ackStatus?: string;
  code?: number;
  msg?: string;
  protocolError?: string;
}

export function normalizeStreamerSignalControlAck(ack: unknown): StreamerSignalControlAck {
  const entries = Array.isArray(ack) ? ack : [ack];
  const ackStatus = typeof entries[0] === "string" ? entries[0] : undefined;
  const resultRecord = entries.map(asRecord).find((record) => record !== null);
  const result = resultRecord ? normalizeStreamerSignalControlResult(resultRecord) : undefined;

  return result ? { ackStatus, result } : { ackStatus };
}

export function getStreamerSignalControlFailure(ack: StreamerSignalControlAck): StreamerSignalControlFailure | null {
  const failedStatus = ack.ackStatus !== undefined && ack.ackStatus !== "success";
  const failedCode = ack.result?.code !== undefined && ack.result.code !== 0;
  if (!failedStatus && !failedCode) return null;

  return {
    ackStatus: ack.ackStatus,
    code: ack.result?.code,
    msg: ack.result?.msg,
    protocolError: ack.result?.code !== undefined ? mapStreamerControlResultProtocolError(ack.result.code) : undefined,
  };
}

export function formatStreamerSignalControlFailure(failure: StreamerSignalControlFailure): string {
  return [
    failure.ackStatus && failure.ackStatus !== "success" ? `ack=${failure.ackStatus}` : null,
    typeof failure.code === "number" ? `code=${failure.code}` : null,
    failure.protocolError ? `protocol=${failure.protocolError}` : null,
    failure.msg ? `msg=${failure.msg}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildStreamerRtcConfiguration(
  result: StreamerSignalControlResult | null | undefined,
  options: { forceRelay?: boolean } = {},
): StreamerRtcConfiguration {
  const forceRelay = options.forceRelay ?? result?.forceRelay ?? false;
  return {
    iceServers: result?.iceServers.map((iceServer) => ({ ...iceServer })) ?? [],
    iceTransportPolicy: forceRelay ? "relay" : "all",
  };
}

function normalizeStreamerSignalControlResult(record: Record<string, unknown>): StreamerSignalControlResult {
  const result: StreamerSignalControlResult = {
    iceServers: normalizeStreamerControlIceServers(record.iceServers),
  };
  assignOptionalString(result, "clientId", record.client_id);
  assignOptionalString(result, "iceId", record.ice_id);
  assignOptionalString(result, "appControlId", record.app_control_id);
  assignOptionalString(result, "msg", record.msg);
  assignOptionalString(result, "streamerData", record.streamer_data);
  assignOptionalNumber(result, "code", record.code);
  assignOptionalNumber(result, "controllerPlatform", record.controller_platform);
  assignOptionalString(result, "appDataBase64", normalizeStreamerBinaryBase64(record.app_data));
  assignOptionalBoolean(result, "forceRelay", record.force_relay);
  assignOptionalBoolean(result, "autoSwitchNetwork", record.auto_switch_network);
  assignOptionalNumber(result, "relayInsType", record.relay_ins_type);
  assignOptionalNumber(result, "forceAutoSwitchPacketLoss", record.force_auto_switch_pkt_loss);
  assignOptionalNumber(result, "forceAutoSwitchLatency", record.force_auto_switch_latency);
  assignOptionalNumber(result, "possibleAutoSwitchPacketLoss", record.possible_auto_switch_pkt_loss);
  assignOptionalNumber(result, "possibleAutoSwitchLatency", record.possible_auto_switch_latency);

  const publisher = normalizeStreamerPeerNetworkInfo(record, "publisher");
  if (publisher) result.publisher = publisher;
  const subscriber = normalizeStreamerPeerNetworkInfo(record, "subscriber");
  if (subscriber) result.subscriber = subscriber;

  return result;
}

function normalizeStreamerControlIceServers(value: unknown): StreamerControlIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeStreamerControlIceServer).filter((item) => item !== null);
}

function normalizeStreamerControlIceServer(value: unknown): StreamerControlIceServer | null {
  const record = asRecord(value);
  if (!record) return null;

  const urls = normalizeStreamerIceServerUrls(record.urls);
  if (!urls) return null;

  const iceServer: StreamerControlIceServer = { urls };
  assignOptionalString(iceServer, "username", record.username);
  assignOptionalString(iceServer, "credential", record.credential);
  return iceServer;
}

function normalizeStreamerIceServerUrls(value: unknown): string | string[] | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!Array.isArray(value)) return null;

  const urls = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (urls.length === 0) return null;
  return urls;
}

function normalizeStreamerBinaryBase64(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;

  const record = asRecord(value);
  if (!record) return undefined;
  return typeof record.base64 === "string" && record.base64.length > 0 ? record.base64 : undefined;
}

function normalizeStreamerPeerNetworkInfo(
  record: Record<string, unknown>,
  prefix: "publisher" | "subscriber",
): StreamerControlPeerNetworkInfo | undefined {
  const info: StreamerControlPeerNetworkInfo = {};
  assignOptionalString(info, "country", record[`${prefix}_country`]);
  assignOptionalString(info, "province", record[`${prefix}_province`]);
  assignOptionalString(info, "city", record[`${prefix}_city`]);
  assignOptionalString(info, "isp", record[`${prefix}_isp`]);
  assignOptionalString(info, "relayIsp", record[`${prefix}_relay_isp`]);

  return Object.keys(info).length > 0 ? info : undefined;
}

export interface BuildStreamerSoacPayloadInput {
  type: StreamerSoacType;
  clientId?: string;
  appControlId?: string;
  iceId?: string;
  sdp?: string;
  gzipSdp?: boolean;
  iceNetworkType?: StreamerIceNetworkType;
  candidate?: StreamerSoacCandidatePayload;
}

export interface StreamerSoacPayload {
  client_id?: string;
  data: {
    type: StreamerSoacType;
    sdp?: string;
    ice_id?: string;
    app_control_id?: string;
    gzip_sdp?: unknown;
    ice_network_type?: StreamerIceNetworkType;
    candidate?: StreamerSoacCandidatePayload;
  };
}

export function buildStreamerSoacPayload(input: BuildStreamerSoacPayloadInput): StreamerSoacPayload {
  const data: StreamerSoacPayload["data"] = { type: input.type };
  if (input.sdp !== undefined) {
    data.sdp = input.sdp;
  }
  if (input.iceId !== undefined) data.ice_id = input.iceId;
  if (input.appControlId !== undefined) data.app_control_id = input.appControlId;
  if (input.type !== "candidate" && input.iceNetworkType !== undefined) {
    data.ice_network_type = input.iceNetworkType;
  }
  if (input.candidate !== undefined) data.candidate = input.candidate;

  return input.clientId === undefined
    ? { data }
    : {
        client_id: input.clientId,
        data,
      };
}

export function mapStreamerControlResultProtocolError(code: number): string {
  switch (code) {
    case 0:
      return "protocol_error_0";
    case 100001:
      return "protocol_error_2021";
    case 100002:
      return "protocol_error_2022";
    case 900001:
      return "protocol_error_2004";
    case 900002:
      return "protocol_error_2023";
    case 900003:
      return "protocol_error_2024";
    default:
      return "protocol_error_2025";
  }
}
