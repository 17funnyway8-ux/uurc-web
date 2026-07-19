import { Github, Handshake, KeyRound, Monitor, Search } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";

import type { UuDeviceGroups } from "@uurc/shared/types";

import { useCommandPaletteController } from "../controllers/useCommandPaletteController.js";
import { CommandPalette } from "./CommandPalette.js";

export function AppShell({
  identityDeviceLabel,
  devices,
  onOpenDevice,
  onLoadDevices,
}: {
  identityDeviceLabel: string;
  devices: UuDeviceGroups;
  onOpenDevice: (deviceId: string) => void;
  onLoadDevices: () => void;
}) {
  const palette = useCommandPaletteController({ devices, onOpenDevice, onLoadDevices });
  const deviceCount = devices.desktopDevices.length + devices.mobileDevices.length + devices.tvDevices.length;

  const navItemClassName = ({ isActive }: { isActive: boolean }) =>
    `app-sidebar-nav-item${isActive ? " is-active" : ""}`;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="app-sidebar-brand" to="/" aria-label="返回 UU Remote Web 首页">
          <span className="app-sidebar-logo" aria-hidden="true">
            <Monitor size={13} />
          </span>
          <span className="app-sidebar-wordmark">UU Remote</span>
          <span className="app-sidebar-badge">WEB</span>
        </Link>

        <button type="button" className="app-sidebar-search" onClick={() => palette.setOpen(true)}>
          <Search size={14} />
          <span>搜索设备</span>
          <kbd>⌘K</kbd>
        </button>

        <nav className="app-sidebar-nav" aria-label="主导航">
          <NavLink to="/devices" className={navItemClassName}>
            <Monitor size={15} />
            <span>我的设备</span>
            <span className="app-sidebar-nav-count">{deviceCount}</span>
          </NavLink>
          <NavLink to="/partner" className={navItemClassName}>
            <Handshake size={15} />
            <span>远控伙伴</span>
          </NavLink>
          <NavLink to="/account" className={navItemClassName}>
            <KeyRound size={15} />
            <span>账号与凭证</span>
          </NavLink>
        </nav>

        <div className="app-sidebar-spacer" />

        <div className="app-sidebar-identity">
          <span className="app-sidebar-identity-dot" aria-hidden="true" />
          <div className="app-sidebar-identity-text">
            <div className="app-sidebar-identity-label">网页控制端</div>
            <div className="app-sidebar-identity-id">{identityDeviceLabel}</div>
          </div>
          <a
            className="app-sidebar-repo-link"
            href="https://github.com/iola1999/uurc-web"
            target="_blank"
            rel="noreferrer"
            aria-label="在 GitHub 查看源码"
          >
            <Github size={14} />
          </a>
        </div>
      </aside>

      <div className="app-shell-content">
        <Outlet />
      </div>

      <CommandPalette {...palette} />
    </div>
  );
}
