// backend/scripts/scrape/run.ts
import { openCouncilSession } from "./session";
import { scrapeCategories, scrapeMeetingList } from "./meetingList";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const { browser, session } = await openCouncilSession();
  const categories = await scrapeCategories(session);
  const failures: { title: string; sourceUrl: string; error: string }[] = [];

  for (const category of categories) {
    await sleep(1500);
    const meetingRows = await scrapeMeetingList(session, category);

    for (const m of meetingRows) {
      await sleep(1500); // be polite to the source site

      // A single meeting's browser launch/parse can fail transiently (confirmed during
      // Task 6 live validation on 2026-08-06: chrome-headless-shell crashed mid-batch on
      // one meeting) — this is a long, one-shot run across every 제10대 committee, so one
      // bad meeting must not abort the whole scrape. Catch, record, and move on.
      try {
        const { statementsAdded } = await upsertScrapedMeeting(m);
        console.log(`Scraped: ${m.title} (${statementsAdded} new statements, category=${category.label})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`FAILED: ${m.title} (category=${category.label}, url=${m.sourceUrl}): ${message}`);
        failures.push({ title: m.title, sourceUrl: m.sourceUrl, error: message });
      }
    }
  }

  await browser.close();

  console.log(`\nDone. ${failures.length} meeting(s) failed.`);
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
