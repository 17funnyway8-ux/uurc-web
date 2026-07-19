import type { RemoteControlInsightsProps } from "../app/remoteControlPageProps.js";
import { RemoteClipboardPanel } from "./RemoteClipboardPanel.js";
import { RemoteConnectionQualityPanel } from "./RemoteConnectionQualityPanel.js";
import { RemoteVideoSourcePanel } from "./RemoteVideoSourcePanel.js";

export function RemoteControlInsights({ quality, clipboard, videoSources }: RemoteControlInsightsProps) {
  return (
    <section className="control-insights" aria-label="远控辅助面板">
      <RemoteConnectionQualityPanel {...quality} />
      <RemoteClipboardPanel {...clipboard} />
      <RemoteVideoSourcePanel {...videoSources} />
    </section>
  );
}
