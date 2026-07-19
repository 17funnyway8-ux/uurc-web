import { MonitorX, TerminalSquare } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";
import { RemoteCommandBar } from "./RemoteCommandBar.js";
import { RemoteControlDiagnosticsDrawer } from "./RemoteControlDiagnosticsDrawer.js";
import { RemoteControlInsights } from "./RemoteControlInsights.js";
import { RemoteControlSettingsDrawer } from "./RemoteControlSettingsDrawer.js";
import { RemoteControlStage } from "./RemoteControlStage.js";
import { RemoteControlTopbar } from "./RemoteControlTopbar.js";
import { RemoteControlWarnings } from "./RemoteControlWarnings.js";

export function RemoteControlPage(props: RemoteControlPageProps) {
  const { shell } = props;
  if (shell.deviceNotFound) {
    return (
      <main className="control-shell">
        <header className="control-topbar">
          <button className="secondary-button" onClick={shell.onReturnToDevices}>
            返回设备列表
          </button>
          <div>
            <h1>设备不存在</h1>
          </div>
          <div className="topbar-actions" />
        </header>
        <section className="device-missing-card">
          <MonitorX size={40} />
          <strong>找不到这台设备</strong>
          <p>该设备可能已被移除、不属于当前账号，或链接已失效。请返回设备列表重新选择。</p>
          <button className="primary-action-button" onClick={shell.onReturnToDevices}>
            返回设备列表
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="control-shell">
      <RemoteControlTopbar {...props.topbar} />

      {shell.error ? (
        <section className="error-strip" role="alert" aria-live="assertive">
          <TerminalSquare size={18} />
          <span>{shell.error}</span>
        </section>
      ) : null}

      <section className="control-stage-layout">
        <div
          className={`control-stage-frame${shell.isFullscreen ? " control-stage-frame--fullscreen" : ""}`}
          ref={shell.remoteStageFrameRef}
        >
          <RemoteCommandBar {...props.commandBar} />
          <RemoteControlStage {...props.stage} />
        </div>
        <RemoteControlWarnings {...props.warnings} />
        <RemoteControlInsights {...props.insights} />
        <div className="control-drawer-row">
          <RemoteControlSettingsDrawer {...props.settings} />
          <RemoteControlDiagnosticsDrawer {...props.diagnostics} />
        </div>
      </section>
    </main>
  );
}
