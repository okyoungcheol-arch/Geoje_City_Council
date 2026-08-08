import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { launchChromium } from "@/scripts/scrape/launchBrowser";
import { scrapeLateDoPage, type ScrapedMeeting } from "@/scripts/scrape/meetingList";
import { db } from "@/db/client";
import { meetings } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

// Safety cap. late.do is newest-first, so a page with zero unseen 제10대 rows means every
// later page is also fully known/older-generation — confirmed live that 제10대 rows run out
// well before page 10, so 50 is a generous ceiling against a 300s budget, not an expected case.
const MAX_PAGES_PER_CHECK = 50;

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const existingRows = await db.select({ sourceMeetingId: meetings.sourceMeetingId }).from(meetings);
  const existingIds = new Set(existingRows.map((r) => r.sourceMeetingId));

  const browser = await launchChromium();
  const newMeetings: ScrapedMeeting[] = [];
  try {
    const page = await browser.newPage();
    for (let pageNo = 1; pageNo <= MAX_PAGES_PER_CHECK; pageNo++) {
      const rows = await scrapeLateDoPage(page, pageNo);
      if (rows.length === 0) break; // no more 제10대 rows on this page or beyond

      const unseen = rows.filter((m) => !existingIds.has(m.sourceMeetingId));
      newMeetings.push(...unseen);

      // Newest-first ordering: if every row on this page is already known, every row on
      // every subsequent page is even older and also already known.
      if (unseen.length === 0) break;
    }
  } finally {
    await browser.close();
  }

  return NextResponse.json({ newMeetings });
}
