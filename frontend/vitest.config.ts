import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@uurc/shared/streamer/clipboard": new URL("../shared/src/streamer/clipboard.ts", import.meta.url).pathname,
      "@uurc/shared/streamer/connectOptions": new URL("../shared/src/streamer/connectOptions.ts", import.meta.url)
        .pathname,
      "@uurc/shared/streamer/controlConfig": new URL("../shared/src/streamer/controlConfig.ts", import.meta.url)
        .pathname,
      "@uurc/shared/streamer/controlChannel": new URL("../shared/src/streamer/controlChannel.ts", import.meta.url)
        .pathname,
      "@uurc/shared/streamer/input": new URL("../shared/src/streamer/input.ts", import.meta.url).pathname,
      "@uurc/shared/streamer/readiness": new URL("../shared/src/streamer/readiness.ts", import.meta.url).pathname,
      "@uurc/shared/streamer/signal": new URL("../shared/src/streamer/signal.ts", import.meta.url).pathname,
      "@uurc/shared/streamer/transport": new URL("../shared/src/streamer/transport.ts", import.meta.url).pathname,
      "@uurc/shared/authState": new URL("../shared/src/authState.ts", import.meta.url).pathname,
      "@uurc/shared/constants": new URL("../shared/src/constants.ts", import.meta.url).pathname,
      "@uurc/shared/loginFlow": new URL("../shared/src/loginFlow.ts", import.meta.url).pathname,
      "@uurc/shared/remoteBootstrap": new URL("../shared/src/remoteBootstrap.ts", import.meta.url).pathname,
      "@uurc/shared/remoteSession": new URL("../shared/src/remoteSession.ts", import.meta.url).pathname,
      "@uurc/shared/roomConfig": new URL("../shared/src/roomConfig.ts", import.meta.url).pathname,
      "@uurc/shared/signalGatewayProtocol": new URL("../shared/src/signalGatewayProtocol.ts", import.meta.url).pathname,
      "@uurc/shared/types": new URL("../shared/src/types.ts", import.meta.url).pathname,
      "@uurc/shared": new URL("../shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
