import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { Toast } from "./components/Toast.js";
import { useRemoteControlController } from "./controllers/useRemoteControlController.js";
import "./styles/index.css";

const LoginPage = lazy(() => import("./components/LoginPage.js").then((module) => ({ default: module.LoginPage })));
const DeviceListPage = lazy(() =>
  import("./components/DeviceListPage.js").then((module) => ({ default: module.DeviceListPage })),
);
const RemoteControlPage = lazy(() =>
  import("./components/RemoteControlPage.js").then((module) => ({ default: module.RemoteControlPage })),
);

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
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
    const deviceListPage = <DeviceListPage {...controller.deviceListPageProps} />;
    const controlPage = <RemoteControlPage {...controller.controlPageProps} />;
    content = (
      <Routes>
        <Route path="/" element={<Navigate to="/devices" replace />} />
        <Route path="/login" element={<Navigate to="/devices" replace />} />
        <Route path="/devices" element={deviceListPage} />
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
