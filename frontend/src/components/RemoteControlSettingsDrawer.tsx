import { CircleStop, LoaderCircle, Monitor, PlugZap } from "lucide-react";

import type { UuDevice, UuParticipantInfo } from "@uurc/shared/devices";

import type { BusyAction, ConnectionRouteMode, SdpTransportMode } from "../app/remoteControlTypes.js";
import {
  STREAMER_FPS_LABELS,
  STREAMER_FPS_OPTIONS,
  STREAMER_VIDEO_QUALITY_LABELS,
  STREAMER_VIDEO_QUALITY_OPTIONS,
  type StreamerFps,
  type StreamerVideoQuality,
} from "../remote/remoteControlPreferences.js";
import { ParticipantList } from "./ParticipantList.js";
import { AnimatedDisclosure } from "./ui/AnimatedDisclosure.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { Switch } from "./ui/Switch.js";

export interface RemoteControlSettingsDrawerProps {
  autoConnect: boolean;
  browserRtcReady: boolean;
  busy: BusyAction;
  connectionRouteMode: ConnectionRouteMode;
  forceJoin: boolean;
  fps: StreamerFps;
  onAutoConnectChange: (enabled: boolean) => void;
  onConnectionRouteModeChange: (mode: ConnectionRouteMode) => void;
  onForceJoinChange: (forceJoin: boolean) => void;
  onFpsChange: (fps: StreamerFps) => void;
  onSignalServerIndexChange: (index: number) => void;
  onSdpTransportModeChange: (mode: SdpTransportMode) => void;
  onStartBrowserRemote: () => void;
  onStartSignalGateway: () => void;
  onStopSignalGateway: () => void;
  onVideoQualityChange: (quality: StreamerVideoQuality) => void;
  sdpTransportMode: SdpTransportMode;
  selectedDevice: UuDevice | null;
  selectedParticipants: UuParticipantInfo[];
  signalServerIndex: number;
  signalServerOptions: string[];
  videoQuality: StreamerVideoQuality;
}

export function RemoteControlSettingsDrawer({
  autoConnect,
  browserRtcReady,
  busy,
  connectionRouteMode,
  forceJoin,
  fps,
  onAutoConnectChange,
  onConnectionRouteModeChange,
  onForceJoinChange,
  onFpsChange,
  onSignalServerIndexChange,
  onSdpTransportModeChange,
  onStartBrowserRemote,
  onStartSignalGateway,
  onStopSignalGateway,
  onVideoQualityChange,
  sdpTransportMode,
  selectedDevice,
  selectedParticipants,
  signalServerIndex,
  signalServerOptions,
  videoQuality,
}: RemoteControlSettingsDrawerProps) {
  return (
    <div className="control-settings-tab">
      <Switch checked={autoConnect} label="进入设备自动连接" onChange={onAutoConnectChange} />
      <div className="control-field">
        <span className="control-field-label">画质</span>
        <SegmentedControl
          name="videoQuality"
          ariaLabel="画质"
          value={videoQuality}
          onChange={onVideoQualityChange}
          options={STREAMER_VIDEO_QUALITY_OPTIONS.map((quality) => ({
            value: quality,
            label: STREAMER_VIDEO_QUALITY_LABELS[quality],
          }))}
        />
      </div>
      <div className="control-field">
        <span className="control-field-label">帧率</span>
        <SegmentedControl
          name="fps"
          ariaLabel="帧率"
          value={fps}
          onChange={onFpsChange}
          options={STREAMER_FPS_OPTIONS.map((fpsOption) => ({
            value: fpsOption,
            label: STREAMER_FPS_LABELS[fpsOption],
          }))}
        />
      </div>
      {selectedDevice ? (
        <div className="control-field">
          <span className="control-field-label">正在占用该设备的控制端</span>
          <ParticipantList participants={selectedParticipants} />
        </div>
      ) : null}
      {selectedDevice ? (
        <div className="control-field">
          <span className="control-field-label">加入模式</span>
          <SegmentedControl
            name="joinMode"
            ariaLabel="加入模式"
            value={forceJoin ? "force" : "normal"}
            onChange={(value) => onForceJoinChange(value === "force")}
            options={[
              { value: "normal", label: "普通加入" },
              { value: "force", label: "接管控制" },
            ]}
          />
        </div>
      ) : null}

      <AnimatedDisclosure
        className="control-subdrawer"
        contentClassName="control-subdrawer-content"
        summary="高级设置（调试用）"
      >
        <div className="transport-actions">
          <button onClick={onStartSignalGateway} disabled={busy !== null}>
            {busy === "signal-start" ? <LoaderCircle className="spin" size={17} /> : <PlugZap size={17} />}
            手动启动连接服务
          </button>
          <button onClick={onStopSignalGateway} disabled={busy !== null}>
            {busy === "signal-stop" ? <LoaderCircle className="spin" size={17} /> : <CircleStop size={17} />}
            手动断开连接
          </button>
          <button onClick={onStartBrowserRemote} disabled={!browserRtcReady}>
            {busy === "browser-remote-start" ? <LoaderCircle className="spin" size={17} /> : <Monitor size={17} />}
            手动启动画面
          </button>
        </div>
        {signalServerOptions.length > 0 ? (
          <label className="control-field select-field" htmlFor="signal-server-index">
            <span className="control-field-label">信令入口</span>
            <select
              id="signal-server-index"
              aria-label="信令入口"
              value={signalServerIndex}
              onChange={(event) => onSignalServerIndexChange(Number(event.target.value))}
            >
              {signalServerOptions.map((server, index) => (
                <option key={`${server}-${index}`} value={index}>
                  {server}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="control-field">
          <span className="control-field-label">画面兼容性</span>
          <SegmentedControl
            name="sdpTransportMode"
            ariaLabel="画面协商"
            value={sdpTransportMode}
            onChange={onSdpTransportModeChange}
            options={[
              { value: "gzip", label: "标准模式" },
              { value: "plain", label: "兼容模式" },
            ]}
          />
        </div>
        <div className="control-field">
          <span className="control-field-label">网络路径</span>
          <SegmentedControl
            name="connectionRouteMode"
            ariaLabel="网络路径"
            value={connectionRouteMode}
            onChange={onConnectionRouteModeChange}
            options={[
              { value: "auto", label: "自动路径" },
              { value: "relay", label: "强制 UU 中转" },
            ]}
          />
        </div>
      </AnimatedDisclosure>
    </div>
  );
}
