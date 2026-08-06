// backend/scripts/spike/inspect-site-7.ts
// Step 2 continued: does the /viewer/minutes.do?uid=N popup page render the speech
// text server-side in the initial HTML, or fetch it via a separate AJAX/JSON call
// after a "회의록을 불러오는 중입니다" loading placeholder? Attach request/response
// listeners to the POPUP page itself this time.
import { chromium } from "playwright";
import { writeFileSync } from "fs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

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

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.click(`[id="minutes-5236_anchor"]`),
  ]);

  const popupXhr: { url: string; method: string; postData: string | null }[] = [];
  popup.on("request", (req) => {
    popupXhr.push({ url: req.url(), method: req.method(), postData: req.postData() });
  });
  const popupResponses: { url: string; body: string }[] = [];
  popup.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] ?? "";
    if ((ct.includes("json") || url.includes("minutes") || url.includes("content")) && !url.match(/\.(css|js|png|jpg|ico|woff)/)) {
      try {
        popupResponses.push({ url, body: await res.text() });
      } catch {
        /* ignore */
      }
    }
  });

  // Wait for the loading placeholder to be replaced.
  await popup.waitForLoadState("networkidle");
  await sleep(2000);

  console.log("=== POPUP URL ===", popup.url());
  console.log("=== POPUP XHR REQUESTS ===");
  for (const r of popupXhr) console.log(`${r.method} ${r.url} ${r.postData ?? ""}`);

  console.log("\n=== POPUP JSON/relevant RESPONSES ===");
  for (const r of popupResponses) {
    console.log(`--- ${r.url}`);
    console.log(r.body.slice(0, 1000));
    writeFileSync(
      "scripts/spike/tmp-popupresp-" + r.url.replace(/[^a-zA-Z0-9]/g, "_").slice(-80) + ".txt",
      r.body,
      "utf-8"
    );
  }

  // Check whether the loading placeholder text is still present or replaced
  const bodyText = await popup.locator("body").innerText();
  console.log("\n=== Contains loading placeholder text? ===", bodyText.includes("불러오는 중"));
  console.log("=== Body text length ===", bodyText.length);

  await browser.close();
}

main();
