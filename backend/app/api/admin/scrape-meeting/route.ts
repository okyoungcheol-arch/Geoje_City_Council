import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";

export const runtime = "nodejs";
export const maxDuration = 300;

// This route hands sourceUrl to a server-side headless browser (scrapeMinutes) and writes
// whatever it fetches into the public-facing statements/meetings tables. The route is gated
// only by a shared PIN, so the URL must additionally be pinned to the council site's origin
// — otherwise a PIN holder could aim the server's browser at an arbitrary internal or
// external host (SSRF). This is the same origin scripts/scrape/session.ts navigates to.
const COUNCIL_ORIGIN = "https://www.gjcl.go.kr";

function isCouncilOrigin(value: string): boolean {
  try {
    return new URL(value).origin === COUNCIL_ORIGIN;
  } catch {
    return false;
  }
}

const ScrapedMeetingSchema = z.object({
  sourceMeetingId: z.string(),
  category: z.string(),
  title: z.string(),
  sessionRound: z.string(),
  sessionNo: z.string(),
  meetingDate: z.string().nullable(),
  sourceUrl: z
    .string()
    .url()
    .refine(isCouncilOrigin, { message: `sourceUrl must be on the council site (${COUNCIL_ORIGIN})` }),
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
