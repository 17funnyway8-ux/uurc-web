import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";

import { useProductController } from "../controllers/useProductController.js";
import { AppMotionProvider } from "../motion/AppMotionProvider.js";
import { Toast } from "./Toast.js";

const LoginPage = lazy(() => import("./LoginPage.js").then((module) => ({ default: module.LoginPage })));
const AppShell = lazy(() => import("./AppShell.js").then((module) => ({ default: module.AppShell })));
const DeviceListPage = lazy(() => import("./DeviceListPage.js").then((module) => ({ default: module.DeviceListPage })));
const RemoteAssistancePage = lazy(() =>
  import("./RemoteAssistancePage.js").then((module) => ({ default: module.RemoteAssistancePage })),
);
const AccountCredentialsPage = lazy(() =>
  import("./AccountCredentialsPage.js").then((module) => ({ default: module.AccountCredentialsPage })),
);
const RemoteControlRoute = lazy(() =>
  import("./RemoteControlRoute.js").then((module) => ({ default: module.RemoteControlRoute })),
);

export function ProductRoutes() {
  const controller = useProductController();
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
        <Route path="/login" element={<LoginPage {...controller.login} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  } else {
    content = (
      <Routes>
        <Route path="/" element={<Navigate to="/devices" replace />} />
        <Route path="/login" element={<Navigate to="/devices" replace />} />
        <Route element={<AppShell {...controller.shell} />}>
          <Route path="/devices" element={<DeviceListPage {...controller.devices} />} />
          <Route path="/partner" element={<RemoteAssistancePage {...controller.assistance} />} />
          <Route path="/account" element={<AccountCredentialsPage {...controller.account} />} />
        </Route>
        <Route path="/devices/:deviceId/control" element={<RemoteControlRoute context={controller.control} />} />
        <Route path="*" element={<Navigate to="/devices" replace />} />
      </Routes>
    );
  }

  return (
    <AppMotionProvider>
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
    </AppMotionProvider>
  );
}
