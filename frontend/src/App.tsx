import { lazy, Suspense } from "react";
import { BrowserRouter, useLocation } from "react-router";

import { LandingPage } from "./components/LandingPage.js";
import { PageMetadata } from "./components/PageMetadata.js";
import { getStoredAuthStatus } from "./uu/loginStateStore.js";
import "./styles/index.css";

const ProductRoutes = lazy(() =>
  import("./components/ProductRoutes.js").then((module) => ({ default: module.ProductRoutes })),
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

  return (
    <Suspense
      fallback={
        <main className="product-shell">
          <p className="empty-text">正在加载页面...</p>
        </main>
      }
    >
      <ProductRoutes />
    </Suspense>
  );
}
