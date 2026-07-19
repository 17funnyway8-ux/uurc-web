import { Eye, GripHorizontal, LoaderCircle, Maximize2, MousePointerClick, PlugZap, Scan } from "lucide-react";

import type { BusyAction, NextAction, RemoteStageViewMode } from "../app/remoteControlTypes.js";
import type { RemoteShortcut } from "../remote/remoteShortcuts.js";
import { RemoteAudioControl, type RemoteAudioControlProps } from "./RemoteAudioControl.js";
import { RemoteShortcutMenu } from "./RemoteShortcutMenu.js";
import { useDraggableFloatingPanel } from "./useDraggableFloatingPanel.js";
import { useFullscreenIdleHide } from "./useFullscreenIdleHide.js";

export interface RemoteCommandBarProps {
  busy: BusyAction;
  controlChannelState: RTCDataChannelState;
  inputControlActive: boolean;
  isFullscreen: boolean;
  nextAction: NextAction;
  onNextAction: () => void;
  onRemoteShortcut: (shortcut: RemoteShortcut) => void;
  onStageViewModeChange: (mode: RemoteStageViewMode) => void;
  onToggleInputControl: () => void;
  onToggleFullscreen: () => void;
  remoteAudio: RemoteAudioControlProps;
  remoteShortcutPlatform: string;
  remoteStageViewMode: RemoteStageViewMode;
}

export function RemoteCommandBar({
  busy,
  controlChannelState,
  inputControlActive,
  isFullscreen,
  nextAction,
  onNextAction,
  onRemoteShortcut,
  onStageViewModeChange,
  onToggleInputControl,
  onToggleFullscreen,
  remoteAudio,
  remoteShortcutPlatform,
  remoteStageViewMode,
}: RemoteCommandBarProps) {
  const nextStageMode = remoteStageViewMode === "fit" ? "fill" : "fit";
  // 非全屏时工具栏固定悬浮在画面底部居中（不可拖动）；仅全屏时允许拖到画面内任意位置。
  const { dragHandleProps, isDragging, panelRef, panelStyle } = useDraggableFloatingPanel<HTMLElement>(isFullscreen);
  const idleHidden = useFullscreenIdleHide(isFullscreen, isDragging);
  const connected = controlChannelState === "open";

  return (
    <section
      ref={panelRef}
      className={`control-command-bar${idleHidden ? " control-command-bar--idle-hidden" : ""}`}
      style={panelStyle}
      aria-label="远控主流程"
    >
      {isFullscreen ? (
        <button className="command-drag-handle" type="button" aria-label="拖动工具栏" {...dragHandleProps}>
          <GripHorizontal size={17} />
        </button>
      ) : null}
      <div className="command-action-group command-action-primary">
        {connected ? (
          <div className="control-mode-switch" role="group" aria-label="控制模式">
            <button
              type="button"
              className={!inputControlActive ? "is-active" : ""}
              aria-pressed={!inputControlActive}
              onClick={() => {
                if (inputControlActive) onToggleInputControl();
              }}
            >
              <Eye size={16} />
              仅查看
            </button>
            <button
              type="button"
              className={inputControlActive ? "is-active" : ""}
              aria-pressed={inputControlActive}
              onClick={() => {
                if (!inputControlActive) onToggleInputControl();
              }}
            >
              <MousePointerClick size={16} />
              控制中
            </button>
          </div>
        ) : (
          <button className="primary-action-button" onClick={onNextAction} disabled={nextAction.disabled}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <PlugZap size={17} />}
            {nextAction.label}
          </button>
        )}
      </div>
      {!connected && nextAction.detail ? <p className="operation-note">{nextAction.detail}</p> : null}
      <div className="command-action-group command-action-tools" aria-label="远控工具栏">
        <RemoteAudioControl {...remoteAudio} />
        <button onClick={() => onStageViewModeChange(nextStageMode)}>
          <Scan size={17} />
          {remoteStageViewMode === "fit" ? "填充画面" : "适应画面"}
        </button>
        <button onClick={onToggleFullscreen}>
          <Maximize2 size={17} />
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
        <RemoteShortcutMenu
          disabled={!inputControlActive}
          platformKey={remoteShortcutPlatform}
          onRemoteShortcut={onRemoteShortcut}
        />
      </div>
    </section>
  );
}
