// backend/scripts/spike/inspect-site-4.ts
// Step 2: On /kr/minutes/committee.do there's a jstree (id=minutes_tree) whose root
// nodes are categories (CT-A = 본회의, CT-C = 상임위원회, etc). Click the 본회의 node,
// capture the AJAX call jstree fires to lazy-load its children, then drill one level
// further into whatever appears (session/round nodes), and see what a leaf item is
// (in-page detail vs link to file).
import { chromium } from "playwright";
import { writeFileSync } from "fs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const xhrLog: { url: string; method: string; postData: string | null }[] = [];
  const responseBodies: Record<string, string> = {};
  page.on("request", (req) => {
    if (req.url().includes(".do") && !req.url().includes("visitant") && !req.url().includes("log.do")) {
      xhrLog.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes(".do") && (url.includes("minutes") || url.includes("Tree") || url.includes("tree"))) {
      try {
        const ct = res.headers()["content-type"] ?? "";
        if (ct.includes("json") || ct.includes("html") || ct.includes("text")) {
          responseBodies[url + "|" + Date.now()] = await res.text();
        }
      } catch {
        /* ignore */
      }
    }
  });

  await page.goto("https://www.gjcl.go.kr/kr/minutes/committee.do", { waitUntil: "networkidle" });
  await sleep(1500); // polite delay

  console.log("=== Clicking 본회의 (CT-A) node ===");
  await page.click("#CT-A_anchor");
  await page.waitForLoadState("networkidle");
  await sleep(1500); // polite delay before further action

  console.log("=== Tree HTML after expanding CT-A ===");
  const treeHtml = await page.locator("#minutes_tree").evaluate((el) => el.outerHTML);
  writeFileSync("scripts/spike/tmp-tree-after-CTA.html", treeHtml, "utf-8");
  console.log(treeHtml.slice(0, 3000));

  console.log("\n=== XHR REQUESTS SO FAR ===");
  for (const r of xhrLog) console.log(`${r.method} ${r.url} ${r.postData ?? ""}`);

  console.log("\n=== RESPONSE BODIES CAPTURED (minutes/tree related) ===");
  for (const [k, v] of Object.entries(responseBodies)) {
    console.log(`--- ${k}`);
    console.log(v.slice(0, 1500));
    writeFileSync(
      "scripts/spike/tmp-resp-" + k.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 80) + ".txt",
      v,
      "utf-8"
    );
  }

  await browser.close();
}

main();
