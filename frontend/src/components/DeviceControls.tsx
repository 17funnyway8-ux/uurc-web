import { ChevronRight, Monitor, Smartphone, Tv } from "lucide-react";

import type { UuDeviceGroups } from "@uurc/shared/types";

import {
  categorizeDeviceGroups,
  getDeviceControlLabel,
  isDeviceOnline,
  type CategorizedDevice,
  type DeviceCategory,
} from "../devices/deviceLabels.js";

const CATEGORY_ICON: Record<DeviceCategory, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tv: Tv,
};

// 平铺展示：不再按设备类型分区块，而是按在线/离线分组，类型只作为行内说明文字。
export function DeviceList({
  devices,
  loading,
  currentDeviceId,
  onSelect,
  onConnect,
}: {
  devices: UuDeviceGroups;
  loading?: boolean;
  currentDeviceId?: string;
  onSelect: (deviceId: string) => void;
  onConnect: (deviceId: string) => void;
}) {
  const categorized = categorizeDeviceGroups(devices);
  const online = categorized.filter((entry) => isDeviceOnline(entry.device));
  const offline = categorized.filter((entry) => !isDeviceOnline(entry.device));

  if (categorized.length === 0) {
    return <p className="empty-text">{loading ? "正在加载设备…" : "暂无设备"}</p>;
  }

  const renderRow = (entry: CategorizedDevice) => {
    const { device, category, categoryLabel } = entry;
    const online = isDeviceOnline(device);
    const Icon = CATEGORY_ICON[category];
    const controlLabel = getDeviceControlLabel(device);
    const canConnect = online && device.controllable && device.deviceId !== currentDeviceId;

    const body = (
      <>
        <span className={`device-row-dot ${online ? "is-online" : "is-offline"}`} aria-hidden="true" />
        <Icon size={17} className="device-row-icon" aria-hidden="true" />
        <span className="device-row-body">
          <span className="device-row-name">{device.alias}</span>
          {device.deviceId === currentDeviceId ? <span className="device-row-badge">本次登录设备</span> : null}
        </span>
        <span className="device-row-meta">
          {categoryLabel} · {controlLabel || (online ? "在线" : "离线")}
        </span>
        {canConnect ? (
          <button
            type="button"
            className="primary-action-button device-row-connect"
            aria-label={`连接 ${device.alias}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(device.deviceId);
              onConnect(device.deviceId);
            }}
          >
            连接
            <ChevronRight size={13} />
          </button>
        ) : null}
      </>
    );

    return (
      <div key={device.deviceId} className={`device-row${online ? " device-row-online" : " device-row-offline"}`}>
        {body}
      </div>
    );
  };

  return (
    <>
      <div className="device-group-label">
        <span>在线 · {online.length}</span>
        <span className="device-group-rule" />
      </div>
      {online.length ? (
        <div className="device-rows-frame">
          <div className="device-rows">{online.map(renderRow)}</div>
        </div>
      ) : (
        <p className="empty-text">暂无在线设备</p>
      )}

      {offline.length ? (
        <details className="device-offline-section" open>
          <summary className="device-group-label">
            <span>离线 · {offline.length}</span>
            <span className="device-group-rule" />
            <span className="device-group-collapse-hint" aria-hidden="true" />
          </summary>
          <div className="device-rows-frame">
            <div className="device-rows">{offline.map(renderRow)}</div>
          </div>
        </details>
      ) : null}

      {devices.tvDevices.length === 0 ? (
        <p className="device-empty-hint">
          <Tv size={13} aria-hidden="true" />
          TV · 暂无设备
        </p>
      ) : null}
    </>
  );
}
