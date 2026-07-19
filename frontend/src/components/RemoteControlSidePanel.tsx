import { RemoteClipboardPanel, type RemoteClipboardPanelProps } from "./RemoteClipboardPanel.js";
import {
  RemoteConnectionQualityPanel,
  type RemoteConnectionQualityPanelProps,
} from "./RemoteConnectionQualityPanel.js";
import {
  RemoteControlDiagnosticsDrawer,
  type RemoteControlDiagnosticsDrawerProps,
} from "./RemoteControlDiagnosticsDrawer.js";
import { RemoteControlSettingsDrawer, type RemoteControlSettingsDrawerProps } from "./RemoteControlSettingsDrawer.js";
import { RemoteVideoSourcePanel, type RemoteVideoSourcePanelProps } from "./RemoteVideoSourcePanel.js";
import { Tabs } from "./ui/Tabs.js";

interface RemoteControlSidePanelProps {
  tab: string;
  onTabChange: (value: string) => void;
  insights: {
    quality: RemoteConnectionQualityPanelProps;
    clipboard: RemoteClipboardPanelProps;
    videoSources: RemoteVideoSourcePanelProps;
  };
  settings: RemoteControlSettingsDrawerProps;
  diagnostics: RemoteControlDiagnosticsDrawerProps;
}

export function RemoteControlSidePanel({
  tab,
  onTabChange,
  insights,
  settings,
  diagnostics,
}: RemoteControlSidePanelProps) {
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
