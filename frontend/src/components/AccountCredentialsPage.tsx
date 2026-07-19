import type { AuthStatus } from "@uurc/shared/authState";

import { DeviceAccountPanel } from "./DeviceAccountPanel.js";
import { StatusPill } from "./StatusPill.js";

export function AccountCredentialsPage({
  authJson,
  authStatus,
  busy,
  identityDeviceLabel,
  identitySourceLabel,
  onExport,
  onCopyAuthJson,
  onLogout,
}: {
  authJson: string;
  authStatus: AuthStatus | null;
  busy: string | null;
  identityDeviceLabel: string;
  identitySourceLabel: string;
  onExport: () => void;
  onCopyAuthJson: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <header className="shell-page-topbar">
        <h1>账号与凭证</h1>
        <StatusPill state="ready">已登录</StatusPill>
      </header>
      <div className="shell-page-body">
        <div className="shell-page-body-medium">
          <DeviceAccountPanel
            authJson={authJson}
            authStatus={authStatus}
            busy={busy}
            identityDeviceLabel={identityDeviceLabel}
            identitySourceLabel={identitySourceLabel}
            onExport={onExport}
            onCopyAuthJson={onCopyAuthJson}
            onLogout={onLogout}
          />
        </div>
      </div>
    </>
  );
}
