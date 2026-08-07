import type { Browser } from "playwright-core";

// Running headless Chromium inside a Vercel serverless function requires a
// serverless-sized binary (@sparticuz/chromium) driven by playwright-core,
// instead of the full `playwright` package whose bundled browser binaries are
// far too large for a Vercel function deployment. Locally (CLI scripts under
// scripts/), we keep using the full `playwright` package's own bundled
// Chromium — no special setup needed for local development.
export async function launchChromium(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: playwrightCore } = await import("playwright-core");
    return playwrightCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const { chromium: playwright } = await import("playwright");
  return playwright.launch();
}
