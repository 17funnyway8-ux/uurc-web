import { RotateCcw } from "lucide-react";

import type { RemoteCommandBarProps } from "../app/remoteControlPageProps.js";

export function RemoteReconnectBanner({
  autoReconnectAttemptCount,
  busy,
  canReconnectRemote,
  onReconnectRemote,
  remoteRecoveryLabel,
}: Pick<
  RemoteCommandBarProps,
  "autoReconnectAttemptCount" | "busy" | "canReconnectRemote" | "onReconnectRemote" | "remoteRecoveryLabel"
>) {
  if (!remoteRecoveryLabel) return null;

  const attemptSuffix = autoReconnectAttemptCount > 0 ? `（第 ${autoReconnectAttemptCount} 次）` : "";

  return (
    <div className="reconnect-banner" role="status">
      <span className="reconnect-banner-spinner" aria-hidden="true" />
      <span>
        {remoteRecoveryLabel} · 正在自动重连{attemptSuffix}
      </span>
      <button onClick={onReconnectRemote} disabled={!canReconnectRemote || busy !== null}>
        <RotateCcw size={12} />
        立即重连
      </button>
    </div>
  );
}
