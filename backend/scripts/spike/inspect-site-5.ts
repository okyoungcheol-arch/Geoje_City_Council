// backend/scripts/spike/inspect-site-5.ts
// Step 2 continued: drill into CT-10-A (제10대 의회 > 본회의) to find the session/round
// level, then drill into one round to find leaf items (actual minutes documents).
import { chromium } from "playwright";
import { writeFileSync } from "fs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const xhrLog: { url: string; method: string; postData: string | null }[] = [];
  const bodies: { key: string; body: string }[] = [];
  page.on("request", (req) => {
    if (req.url().includes(".do") && !req.url().includes("visitant") && !req.url().includes("log.do")) {
      xhrLog.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/minutes/") && url.includes(".do")) {
      try {
        const ct = res.headers()["content-type"] ?? "";
        if (ct.includes("json") || ct.includes("text")) {
          bodies.push({ key: url + "#" + Date.now(), body: await res.text() });
        }
      } catch {
        /* ignore */
      }
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/minutes/committee.do", { waitUntil: "networkidle" });
  await sleep(1500);

  await page.click("#CT-A_anchor");
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  console.log("=== Clicking CT-10-A (제10대 의회 > 본회의) ===");
  await page.click("#CT-10-A_anchor");
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  const treeAfterTh = await page.locator("#minutes_tree").evaluate((el) => el.outerHTML);
  writeFileSync("scripts/spike/tmp-tree-after-th10.html", treeAfterTh, "utf-8");

  // Find the child node ids under CT-10-A
  const childIds = await page.locator("#CT-10-A ul.jstree-children > li").evaluateAll((els) =>
    els.map((el) => ({ id: el.id, title: (el.querySelector("a") as HTMLElement | null)?.title }))
  );
  console.log("=== Children of CT-10-A (rounds/sessions) ===", JSON.stringify(childIds, null, 2));

  if (childIds.length > 0) {
    const firstId = childIds[0].id;
    console.log(`\n=== Clicking first child: ${firstId} ===`);
    await page.click(`[id="${firstId}_anchor"]`);
    await page.waitForLoadState("networkidle");
    await sleep(1500);

    const treeAfterSession = await page.locator("#minutes_tree").evaluate((el) => el.outerHTML);
    writeFileSync("scripts/spike/tmp-tree-after-session.html", treeAfterSession, "utf-8");

    const leafIds = await page
      .locator(`[id="${firstId}"] ul.jstree-children > li`)
      .evaluateAll((els) => els.map((el) => ({ id: el.id, title: (el.querySelector("a") as HTMLElement | null)?.title, cls: el.className })));
    console.log("=== Children (leaves?) of first session node ===", JSON.stringify(leafIds, null, 2));
  }

  console.log("\n=== ALL XHR REQUESTS ===");
  for (const r of xhrLog) console.log(`${r.method} ${r.url} ${r.postData ?? ""}`);

  console.log("\n=== RESPONSE BODIES ===");
  for (const b of bodies) {
    console.log(`--- ${b.key}`);
    console.log(b.body.slice(0, 1500));
    writeFileSync(
      "scripts/spike/tmp-resp5-" + b.key.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 100) + ".txt",
      b.body,
      "utf-8"
    );
  }

  await browser.close();
}

main();
