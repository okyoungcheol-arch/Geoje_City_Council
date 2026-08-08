import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { launchChromium } from "@/scripts/scrape/launchBrowser";
import { scrapeLateDoPage, type ScrapedMeeting } from "@/scripts/scrape/meetingList";
import { db } from "@/db/client";
import { meetings } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

// Safety cap. late.do is ordered by meeting date, not publication time, so a meeting can be
// published (and land in the listing) long after its date — an already-known-looking page must
// not stop the scan (see scrapeLateDoPage's own generation filter for the real termination
// signal: zero 제10대 rows). Confirmed live that 제10대 rows run out well before page 10, so 50
// is a generous ceiling against a 300s budget, not an expected case.
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
    }
  } finally {
    await browser.close();
  }

  return NextResponse.json({ newMeetings });
}
