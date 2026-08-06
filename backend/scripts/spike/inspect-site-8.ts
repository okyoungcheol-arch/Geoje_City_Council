// backend/scripts/spike/inspect-site-8.ts
// Step 2 final check: can /viewer/minutes.do?uid=N be navigated to directly (fresh
// session, no prior tree-click flow) and still return the full server-rendered
// minutes text? This matters for Task 4/5 - if true, the scraper doesn't need to
// replay the whole jstree click flow per-document, just discover uids via the
// minutes.do tree JSON endpoints and then GET the viewer page directly.
import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const res = await page.goto("https://www.gjcl.go.kr/viewer/minutes.do?uid=5236", {
    waitUntil: "networkidle",
  });
  console.log("=== STATUS ===", res?.status());
  const content = await page.content();
  console.log("=== LENGTH ===", content.length);
  console.log("=== Contains speaker-block markup? ===", content.includes("speaker-block"));
  console.log("=== Contains 김동수? ===", content.includes("김동수"));
  writeFileSync("scripts/spike/tmp-minutes-direct-5236.html", content, "utf-8");

  await browser.close();
}

main();
