// backend/scripts/spike/inspect-site-6.ts
// Step 2 continued: click a leaf minutes node (uid=5236, "새창열림" = opens new window)
// and capture whatever page/response that opens - is it server-rendered HTML with the
// full minutes text, a JSON/AJAX payload, or a file download (PDF/HWP)?
import { chromium } from "playwright";
import { writeFileSync } from "fs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const xhrLog: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(".do") && !req.url().includes("visitant") && !req.url().includes("log.do")) {
      xhrLog.push(`${req.method()} ${req.url()} ${req.postData() ?? ""}`);
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/minutes/committee.do", { waitUntil: "networkidle" });
  await sleep(1500);
  await page.click("#CT-A_anchor");
  await page.waitForLoadState("networkidle");
  await sleep(1500);
  await page.click(`[id="CT-10-A_anchor"]`);
  await page.waitForLoadState("networkidle");
  await sleep(1500);
  await page.click(`[id="CT-10-0264-A_anchor"]`);
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  console.log("=== Clicking leaf minutes-5236 (제1차 회의록) - expecting popup ===");
  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 10000 }).catch(() => null),
    page.click(`[id="minutes-5236_anchor"]`).catch((e) => console.log("click error:", e.message)),
  ]);

  if (popup) {
    await popup.waitForLoadState("networkidle").catch(() => {});
    console.log("=== POPUP URL ===", popup.url());
    const content = await popup.content();
    console.log("=== POPUP CONTENT LENGTH ===", content.length);
    writeFileSync("scripts/spike/tmp-minutes-detail-5236.html", content, "utf-8");
    console.log(content.slice(0, 3000));
  } else {
    console.log("No popup detected. Checking current page state instead.");
    await sleep(1000);
    console.log("Current URL:", page.url());
  }

  console.log("\n=== XHR LOG ===");
  for (const r of xhrLog) console.log(r);

  await browser.close();
}

main();
