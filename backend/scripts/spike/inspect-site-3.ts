// backend/scripts/spike/inspect-site-3.ts
// Step 1c: The plenary.do page turned out to be "영상회의록" (VIDEO minutes) - out of
// scope. The site has a separate non-video "회의록" (minutes text) section with links
// like /kr/minutes/committee.do (회의별 = by meeting). Explore that page's form/selects.
import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(".do")) {
      requests.push(`${req.method()} ${req.url()} ${req.postData() ?? ""}`);
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/minutes/committee.do", { waitUntil: "networkidle" });
  writeFileSync("scripts/spike/tmp-minutes-committee.html", await page.content(), "utf-8");
  console.log("=== PAGE TITLE ===", await page.title());

  console.log("=== ALL SELECTS ===");
  const selects = await page.locator("select").all();
  console.log("count:", selects.length);
  for (const sel of selects) {
    const id = await sel.evaluate((el) => el.id);
    console.log("id=", id);
    console.log(await sel.evaluate((el) => el.outerHTML));
    console.log("---");
  }

  console.log("=== ALL FORMS ===");
  const forms = await page.locator("form").all();
  for (const f of forms) {
    console.log(await f.evaluate((el) => el.outerHTML.slice(0, 1500)));
    console.log("=====");
  }

  console.log("=== REQUESTS SO FAR ===");
  for (const r of requests) console.log(r);

  await browser.close();
}

main();
