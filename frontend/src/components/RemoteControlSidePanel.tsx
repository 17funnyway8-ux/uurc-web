import type { RemoteControlPageProps } from "./RemoteControlPage.js";
import { RemoteClipboardPanel } from "./RemoteClipboardPanel.js";
import { RemoteConnectionQualityPanel } from "./RemoteConnectionQualityPanel.js";
import { RemoteControlDiagnosticsDrawer } from "./RemoteControlDiagnosticsDrawer.js";
import { RemoteControlSettingsDrawer } from "./RemoteControlSettingsDrawer.js";
import { RemoteVideoSourcePanel } from "./RemoteVideoSourcePanel.js";
import { Tabs } from "./ui/Tabs.js";

export function RemoteControlSidePanel({
  tab,
  onTabChange,
  insights,
  settings,
  diagnostics,
}: {
  tab: string;
  onTabChange: (value: string) => void;
  insights: RemoteControlPageProps["insights"];
  settings: RemoteControlPageProps["settings"];
  diagnostics: RemoteControlPageProps["diagnostics"];
}) {
  return (
    <aside className="control-side-panel" aria-label="会话面板">
      <Tabs
        ariaLabel="会话面板"
        variant="pill"
        value={tab}
        onChange={onTabChange}
        items={[
          {
            value: "status",
            label: "状态",
            content: (
              <div className="control-side-panel-body">
                <RemoteConnectionQualityPanel {...insights.quality} />
                <RemoteVideoSourcePanel {...insights.videoSources} />
              </div>
            ),
          },
          {
            value: "clipboard",
            label: "剪贴板",
            content: (
              <div className="control-side-panel-body">
                <RemoteClipboardPanel {...insights.clipboard} />
              </div>
            ),
          },
          {
            value: "settings",
            label: "设置",
            content: (
              <div className="control-side-panel-body">
                <RemoteControlSettingsDrawer {...settings} />
                <RemoteControlDiagnosticsDrawer {...diagnostics} />
              </div>
            ),
          },
        ]}
      />
    </aside>
  );
}
