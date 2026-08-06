// backend/scripts/spike/inspect-site-9.ts
// Step 2 detail: check request headers (CSRF token?) and response content-type for
// the tree-list async endpoints, and try replaying session.do with a fresh
// unauthenticated request (no prior page visit) to see if a CSRF/session cookie is
// actually required, or if it's just standard Spring form scaffolding that isn't
// enforced on these read-only endpoints.
import { chromium } from "playwright";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("request", (req) => {
    if (req.url().includes("/minutes/async/")) {
      console.log(`REQ: ${req.method()} ${req.url()}`);
      console.log("  headers:", JSON.stringify(req.headers()));
      console.log("  postData:", req.postData());
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("/minutes/async/")) {
      console.log(`RES: ${res.status()} ${res.url()} content-type=${res.headers()["content-type"]}`);
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/minutes/committee.do", { waitUntil: "networkidle" });
  await sleep(1500);
  await page.click("#CT-A_anchor");
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  await browser.close();

  console.log("\n=== Now trying a cold POST via fetch from a brand-new context (no prior page visit, no cookies) ===");
  await sleep(1500);
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage();
  // Navigate to about:blank first so we have a JS context to run fetch from, but
  // do NOT visit gjcl.go.kr first - simulates a script hitting the API cold.
  await page2.goto("about:blank");
  const result = await page2.evaluate(async () => {
    const res = await fetch("https://www.gjcl.go.kr/minutes/async/session.do", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "cl_cd=CT&th=10&cmt_cd=A",
    });
    return { status: res.status, body: await res.text() };
  });
  console.log("Cold fetch result:", JSON.stringify(result).slice(0, 1000));
  await browser2.close();
}

main();
