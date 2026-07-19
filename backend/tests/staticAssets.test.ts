import { describe, expect, it } from "vitest";

import { getStaticCacheControl } from "../src/app.js";

describe("static asset cache policy", () => {
  it("keeps hashed assets immutable and the SPA shell revalidating", () => {
    expect(getStaticCacheControl("/app/frontend/dist/assets/index-Bz19xK8p.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(getStaticCacheControl("/app/frontend/dist/index.html")).toBe("no-cache");
    expect(getStaticCacheControl("/app/frontend/dist/favicon.svg")).toBeUndefined();
  });
});
