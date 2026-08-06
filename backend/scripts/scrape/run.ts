// backend/scripts/scrape/run.ts
import { db } from "@/db/client";
import { meetings, members, agendaItems, statements } from "@/db/schema";
import { openCouncilSession } from "./session";
import { scrapeCategories, scrapeMeetingList } from "./meetingList";
import { scrapeMinutes } from "./minutes";

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
        const [meetingRow] = await db
          .insert(meetings)
          .values({
            sourceMeetingId: m.sourceMeetingId,
            generation: "제10대",
            category: m.category,
            title: m.title,
            sessionRound: m.sessionRound,
            sessionNo: m.sessionNo,
            meetingDate: m.meetingDate,
            sourceUrl: m.sourceUrl,
          })
          .onConflictDoUpdate({ target: meetings.sourceMeetingId, set: { title: m.title } })
          .returning();

        const scrapedStatements = await scrapeMinutes(m.sourceUrl);
        const agendaTitles = [...new Set(scrapedStatements.map((s) => s.agendaTitle).filter((t): t is string => !!t))];

        const agendaIdByTitle = new Map<string, number>();
        for (const [i, title] of agendaTitles.entries()) {
          const [row] = await db
            .insert(agendaItems)
            .values({ meetingId: meetingRow.id, title, orderInMeeting: i })
            // onConflictDoUpdate (not onConflictDoNothing) so `.returning()` always yields a
            // row even when the agenda item already exists from a prior run — matches the
            // pattern used for `meetings`/`members` above. onConflictDoNothing would return
            // an empty array on conflict, and `row.id` below would throw on `undefined`.
            // Self-assigns `title` as a no-op update, keeping this idempotent on
            // (meetingId, title) via the unique index added for this exact gap.
            .onConflictDoUpdate({ target: [agendaItems.meetingId, agendaItems.title], set: { title } })
            .returning();
          agendaIdByTitle.set(title, row.id);
        }

        for (const s of scrapedStatements) {
          const [memberRow] = await db
            .insert(members)
            .values({ name: s.memberName, generation: "제10대" })
            // drizzle-orm's onConflictDoUpdate throws "No values to set" for an empty `set`
            // object (confirmed during Task 6 live validation on 2026-08-06) — self-assign
            // `name` as a harmless no-op so the upsert-and-return pattern actually executes.
            .onConflictDoUpdate({ target: [members.name, members.generation], set: { name: s.memberName } })
            .returning();

          await db
            .insert(statements)
            .values({
              meetingId: meetingRow.id,
              agendaItemId: s.agendaTitle ? agendaIdByTitle.get(s.agendaTitle) ?? null : null,
              memberId: memberRow.id,
              rawText: s.rawText,
              orderInMeeting: s.orderInMeeting,
            })
            .onConflictDoNothing();
        }

        console.log(`Scraped: ${m.title} (${scrapedStatements.length} statements, category=${category.label})`);
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
