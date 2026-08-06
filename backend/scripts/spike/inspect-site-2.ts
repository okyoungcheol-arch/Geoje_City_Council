// backend/scripts/spike/inspect-site-2.ts
// Step 1b: dump full page content + capture response bodies for the XHR calls
// that fire automatically on page load (loadOrderList.do, loadAgendaList.do).
import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const responses: { url: string; method: string; postData: string | null; body: string }[] = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes(".do") && (url.includes("load") || url.includes("List") || url.includes("Agenda"))) {
      try {
        const body = await res.text();
        responses.push({
          url,
          method: res.request().method(),
          postData: res.request().postData(),
          body,
        });
      } catch {
        // ignore bodies we can't read (e.g. redirects)
      }
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/cast/plenary.do", { waitUntil: "networkidle" });

  console.log("=== FULL PAGE HTML LENGTH ===", (await page.content()).length);
  writeFileSync("scripts/spike/tmp-plenary-page.html", await page.content(), "utf-8");

  console.log("=== ALL SELECTS ===");
  const selects = await page.locator("select").all();
  console.log("count:", selects.length);
  for (const sel of selects) {
    console.log(await sel.evaluate((el) => el.outerHTML));
    console.log("---");
  }

  console.log("=== CAPTURED XHR RESPONSES ===");
  for (const r of responses) {
    console.log(`\n--- ${r.method} ${r.url}`);
    console.log("postData:", r.postData);
    console.log("body (first 2000 chars):", r.body.slice(0, 2000));
    const fname = "scripts/spike/tmp-" + r.url.split("/").pop()!.replace(".do", "") + ".txt";
    writeFileSync(fname, r.body, "utf-8");
  }

  await browser.close();
}

main();
