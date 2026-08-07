import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { openCouncilSession } from "@/scripts/scrape/session";
import { scrapeCategories, scrapeMeetingList, type ScrapedMeeting } from "@/scripts/scrape/meetingList";
import { db } from "@/db/client";
import { meetings } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const existingRows = await db.select({ sourceMeetingId: meetings.sourceMeetingId }).from(meetings);
  const existingIds = new Set(existingRows.map((r) => r.sourceMeetingId));

  const { browser, session } = await openCouncilSession();
  const allScraped: ScrapedMeeting[] = [];
  try {
    const categories = await scrapeCategories(session);
    for (const category of categories) {
      const meetingRows = await scrapeMeetingList(session, category);
      allScraped.push(...meetingRows);
    }
  } finally {
    await browser.close();
  }

  const newMeetings = allScraped.filter((m) => !existingIds.has(m.sourceMeetingId));
  return NextResponse.json({ newMeetings });
}
