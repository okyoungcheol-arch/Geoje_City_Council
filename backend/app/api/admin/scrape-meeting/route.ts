import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";

export const runtime = "nodejs";
export const maxDuration = 300;

const ScrapedMeetingSchema = z.object({
  sourceMeetingId: z.string(),
  category: z.string(),
  title: z.string(),
  sessionRound: z.string(),
  sessionNo: z.string(),
  meetingDate: z.string().nullable(),
  sourceUrl: z.string(),
});
const BodySchema = z.object({ meeting: ScrapedMeetingSchema });

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const json = await request.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid meeting payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { statementsAdded } = await upsertScrapedMeeting(parsed.data.meeting);
  return NextResponse.json({ statementsAdded });
}
