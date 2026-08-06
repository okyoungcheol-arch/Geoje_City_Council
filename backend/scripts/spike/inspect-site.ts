// backend/scripts/spike/inspect-site.ts
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch(); // headless (default) — no human is watching
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(".do") || req.url().includes("ajax") || req.url().includes("json")) {
      requests.push(`${req.method()} ${req.url()} ${req.postData() ?? ""}`);
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/cast/plenary.do");
  console.log("=== FORM HTML ===");
  console.log(await page.locator("form").first().evaluate((el) => el.outerHTML));
  console.log("=== SELECT OPTIONS ===");
  const selects = await page.locator("select").all();
  for (const sel of selects) {
    console.log(await sel.evaluate((el) => el.outerHTML));
  }

  await browser.close();
  console.log("=== REQUESTS SO FAR ===", requests);
}

main();
