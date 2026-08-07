import { db } from "@/db/client";
import { meetings, members, agendaItems, statements } from "@/db/schema";
import { scrapeMinutes } from "@/scripts/scrape/minutes";
import type { ScrapedMeeting } from "@/scripts/scrape/meetingList";

export async function upsertScrapedMeeting(m: ScrapedMeeting): Promise<{ meetingId: number; statementsAdded: number }> {
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
      .onConflictDoUpdate({ target: [agendaItems.meetingId, agendaItems.title], set: { title } })
      .returning();
    agendaIdByTitle.set(title, row.id);
  }

  let statementsAdded = 0;
  for (const s of scrapedStatements) {
    const [memberRow] = await db
      .insert(members)
      .values({ name: s.memberName, generation: "제10대" })
      .onConflictDoUpdate({ target: [members.name, members.generation], set: { name: s.memberName } })
      .returning();

    const inserted = await db
      .insert(statements)
      .values({
        meetingId: meetingRow.id,
        agendaItemId: s.agendaTitle ? agendaIdByTitle.get(s.agendaTitle) ?? null : null,
        memberId: memberRow.id,
        rawText: s.rawText,
        orderInMeeting: s.orderInMeeting,
      })
      .onConflictDoNothing()
      .returning({ id: statements.id });
    if (inserted.length > 0) statementsAdded++;
  }

  return { meetingId: meetingRow.id, statementsAdded };
}
