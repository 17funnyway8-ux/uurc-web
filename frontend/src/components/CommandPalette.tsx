import { ChevronRight, Handshake, Monitor, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { CommandPaletteController } from "../controllers/useCommandPaletteController.js";
import { isDeviceOnline } from "../devices/deviceLabels.js";

export function CommandPalette({
  open,
  query,
  matches,
  setOpen,
  setQuery,
  onSelectDevice,
  onConnectByIdFromQuery,
  onRefresh,
}: CommandPaletteController) {
  const inputRef = useRef<HTMLInputElement>(null);
  const firstMatch = matches[0];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="command-palette-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="command-palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onKeyDown={(event) => {
          if (event.key === "Enter" && firstMatch) {
            event.preventDefault();
            onSelectDevice(firstMatch.deviceId);
          }
        }}
      >
        <div className="command-palette-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索设备，或按设备 ID 直连伙伴…"
            aria-label="搜索设备或操作"
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-palette-body">
          {matches.length > 0 ? (
            <>
              <div className="command-palette-section-label">设备</div>
              {matches.map((device, index) => (
                <button
                  key={device.deviceId}
                  type="button"
                  className={`command-palette-row${index === 0 ? " is-active" : ""}`}
                  onClick={() => onSelectDevice(device.deviceId)}
                >
                  <span className={`command-palette-dot ${isDeviceOnline(device) ? "is-online" : "is-offline"}`} />
                  <Monitor size={16} />
                  <span className="command-palette-row-label">{device.alias}</span>
                  <span className="command-palette-row-hint">
                    连接
                    <kbd>↵</kbd>
                  </span>
                </button>
              ))}
            </>
          ) : null}
          <div className="command-palette-section-label">操作</div>
          <button type="button" className="command-palette-row" onClick={onConnectByIdFromQuery}>
            <Handshake size={15} />
            <span className="command-palette-row-label">按设备 ID 连接伙伴设备…</span>
            <ChevronRight size={13} className="command-palette-row-chevron" />
          </button>
          <button
            type="button"
            className="command-palette-row"
            onClick={() => {
              onRefresh();
              setOpen(false);
            }}
          >
            <RefreshCw size={15} />
            <span className="command-palette-row-label">刷新设备列表</span>
            <kbd>R</kbd>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
