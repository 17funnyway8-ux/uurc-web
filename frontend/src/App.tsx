import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";

import { LandingPage } from "./components/LandingPage.js";
import { PageMetadata } from "./components/PageMetadata.js";
import { Toast } from "./components/Toast.js";
import { useRemoteControlController } from "./controllers/useRemoteControlController.js";
import { getStoredAuthStatus } from "./uu/loginStateStore.js";
import "./styles/index.css";

const LoginPage = lazy(() => import("./components/LoginPage.js").then((module) => ({ default: module.LoginPage })));
const AppShell = lazy(() => import("./components/AppShell.js").then((module) => ({ default: module.AppShell })));
const DeviceListPage = lazy(() =>
  import("./components/DeviceListPage.js").then((module) => ({ default: module.DeviceListPage })),
);
const RemoteAssistancePage = lazy(() =>
  import("./components/RemoteAssistancePage.js").then((module) => ({ default: module.RemoteAssistancePage })),
);
const AccountCredentialsPage = lazy(() =>
  import("./components/AccountCredentialsPage.js").then((module) => ({ default: module.AccountCredentialsPage })),
);
const RemoteControlPage = lazy(() =>
  import("./components/RemoteControlPage.js").then((module) => ({ default: module.RemoteControlPage })),
);

export default function App() {
  return (
    <BrowserRouter>
      <PageMetadata />
      <RootRoutes />
    </BrowserRouter>
  );
}

function RootRoutes() {
  const location = useLocation();

  if (location.pathname === "/") {
    return <LandingPage loggedIn={getStoredAuthStatus().hasState} />;
  }

  return <ProductRoutes />;
}

function ProductRoutes() {
  const controller = useRemoteControlController();
  let content: ReactNode;
  if (controller.authLoading) {
    content = (
      <main className="product-shell auth-product-shell" aria-label="正在恢复账号凭证">
        <p className="empty-text">正在恢复账号凭证...</p>
      </main>
    );
  } else if (!controller.loggedIn) {
    content = (
      <Routes>
        <Route path="/login" element={<LoginPage {...controller.loginPageProps} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  } else {
    const d = controller.deviceListPageProps;
    const deviceListPage = <DeviceListPage {...d} />;
    const partnerPage = (
      <RemoteAssistancePage
        busy={d.busy}
        connectCode={d.assistanceConnectCode}
        connectId={d.assistanceConnectId}
        error={d.error}
        notice={d.assistanceNotice}
        onConnectCodeChange={d.onAssistanceConnectCodeChange}
        onConnectIdChange={d.onAssistanceConnectIdChange}
        onStart={d.onStartRemoteAssistance}
      />
    );
    const accountPage = (
      <AccountCredentialsPage
        authJson={d.authJson}
        authStatus={d.authStatus}
        busy={d.busy}
        identityDeviceLabel={d.identityDeviceLabel}
        identitySourceLabel={d.identitySourceLabel}
        onExport={d.onExport}
        onCopyAuthJson={d.onCopyAuthJson}
        onLogout={d.onLogout}
      />
    );
    const controlPage = <RemoteControlPage {...controller.controlPageProps} />;
    content = (
      <Routes>
        <Route path="/" element={<Navigate to="/devices" replace />} />
        <Route path="/login" element={<Navigate to="/devices" replace />} />
        <Route
          element={
            <AppShell
              identityDeviceLabel={d.identityDeviceLabel}
              devices={d.devices}
              onOpenDevice={d.onOpenDevice}
              onLoadDevices={d.onLoadDevices}
            />
          }
        >
          <Route path="/devices" element={deviceListPage} />
          <Route path="/partner" element={partnerPage} />
          <Route path="/account" element={accountPage} />
        </Route>
        <Route path="/devices/:deviceId/control" element={controlPage} />
        <Route path="*" element={<Navigate to="/devices" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <Suspense
        fallback={
          <main className="product-shell">
            <p className="empty-text">正在加载页面...</p>
          </main>
        }
      >
        {content}
      </Suspense>
      <Toast toast={controller.toast} onDismiss={controller.onDismissToast} />
    </>
  );
}
