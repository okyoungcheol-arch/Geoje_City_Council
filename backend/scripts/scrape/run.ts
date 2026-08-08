// backend/scripts/scrape/run.ts
import { launchChromium } from "./launchBrowser";
import { scrapeLateDoPage } from "./meetingList";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await launchChromium();
  const page = await browser.newPage();
  const failures: { title: string; sourceUrl: string; error: string }[] = [];
  let pageNo = 1;
  let totalMeetings = 0;

  try {
    while (true) {
      await sleep(1500); // polite delay before each late.do page request
      const rows = await scrapeLateDoPage(page, pageNo);
      if (rows.length === 0) break; // no more 제10대 rows on this page or beyond

      for (const m of rows) {
        await sleep(1500); // polite delay before each minutes document fetch

        // A single meeting's browser launch/parse can fail transiently — this is a long,
        // multi-page run across the whole 제10대 term, so one bad meeting must not abort
        // the whole scrape. Catch, record, and move on.
        try {
          const { statementsAdded } = await upsertScrapedMeeting(m);
          console.log(`Scraped: ${m.title} (${statementsAdded} new statements, page=${pageNo})`);
          totalMeetings++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`FAILED: ${m.title} (page=${pageNo}, url=${m.sourceUrl}): ${message}`);
          failures.push({ title: m.title, sourceUrl: m.sourceUrl, error: message });
        }
      }
      pageNo++;
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ${totalMeetings} meeting(s) processed across ${pageNo - 1} page(s). ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log(JSON.stringify(failures, null, 2));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
