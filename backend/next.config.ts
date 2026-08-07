import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The admin scraping routes launch headless Chromium via
  // scripts/scrape/launchBrowser.ts. On Vercel that path uses @sparticuz/chromium +
  // playwright-core, both of which must stay external to the bundle — bundling or
  // tree-shaking them breaks @sparticuz/chromium's executablePath() resolution of its
  // packaged brotli binaries.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  // serverExternalPackages keeps these two packages out of the bundle, but
  // Next's file tracer doesn't follow their internal dynamic requires —
  // playwright-core loads browsers.json via lib/coreBundle.js, and
  // @sparticuz/chromium loads its brotli-compressed binaries from bin/ via
  // executablePath(). Without these includes the deployed function is
  // missing those files and every launch throws at runtime.
  outputFileTracingIncludes: {
    "/api/admin/check-new-meetings": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/api/admin/scrape-meeting": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
