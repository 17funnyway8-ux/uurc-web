import { Clipboard, ClipboardCheck, Copy, RefreshCw } from "lucide-react";

import type { RemoteClipboardPanelProps } from "../app/remoteControlPageProps.js";

export function RemoteClipboardPanel({
  canCopyRemoteClipboard,
  canReadLocalClipboard,
  canSendClipboardText,
  clipboardSyncAvailable,
  clipboardSyncEnabled,
  clipboardPreviewLabel,
  localClipboardStatusLabel,
  remoteClipboardPendingText,
  remoteClipboardStatusLabel,
  onClipboardSyncEnabledChange,
  onCopyRemoteClipboard,
  onReadLocalClipboard,
  onSendClipboardText,
}: RemoteClipboardPanelProps) {
  return (
    <section className="control-insight-panel" aria-label="剪贴板">
      <header>
        <div>
          <Clipboard size={17} />
          <h2>剪贴板</h2>
        </div>
        <span>{clipboardPreviewLabel}</span>
      </header>
      <label className={`switch-control switch-control-inline${clipboardSyncAvailable ? "" : " is-disabled"}`}>
        <input
          type="checkbox"
          checked={clipboardSyncEnabled}
          disabled={!clipboardSyncAvailable}
          onChange={(event) => onClipboardSyncEnabledChange(event.target.checked)}
        />
        <span>
          <RefreshCw size={15} />
          同步剪贴板
        </span>
        <i aria-hidden="true" />
      </label>
      <div className="clipboard-direction-status" aria-live="polite">
        <p>
          <strong>本机到远端</strong>
          <span>{localClipboardStatusLabel}</span>
        </p>
        <p>
          <strong>远端到本机</strong>
          <span>{remoteClipboardStatusLabel}</span>
        </p>
      </div>
      {remoteClipboardPendingText !== null ? (
        <label className="clipboard-fallback">
          <span>收到的内容</span>
          <textarea value={remoteClipboardPendingText} readOnly rows={3} />
        </label>
      ) : null}
      <div className="panel-action-row">
        <button onClick={onReadLocalClipboard} disabled={!canReadLocalClipboard}>
          <ClipboardCheck size={16} />
          同步一次
        </button>
        <button onClick={onSendClipboardText} disabled={!canSendClipboardText}>
          <RefreshCw size={16} />
          再次发送
        </button>
        {remoteClipboardPendingText !== null ? (
          <button onClick={onCopyRemoteClipboard} disabled={!canCopyRemoteClipboard}>
            <Copy size={16} />
            复制收到内容
          </button>
        ) : null}
      </div>
    </section>
  );
}
