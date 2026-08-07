import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The admin scraping routes launch headless Chromium via
  // scripts/scrape/launchBrowser.ts. On Vercel that path uses @sparticuz/chromium +
  // playwright-core, both of which must stay external to the bundle — bundling or
  // tree-shaking them breaks @sparticuz/chromium's executablePath() resolution of its
  // packaged brotli binaries.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
};

export default nextConfig;
