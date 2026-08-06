import { NextRequest, NextResponse } from "next/server";
import { getInsightRows } from "@/lib/queries/insights";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const member = searchParams.get("member");
  const meeting = searchParams.get("meeting");
  const minGeojeImpact = Number(searchParams.get("minGeojeImpact") ?? "1");

  const rows = await getInsightRows();
  const filtered = rows.filter(
    (r) =>
      (!member || r.memberName === member) &&
      (!meeting || r.meetingTitle === meeting) &&
      r.geojeImpactScore >= minGeojeImpact
  );

  return NextResponse.json(filtered);
}
