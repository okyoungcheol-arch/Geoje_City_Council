import { NextRequest, NextResponse } from "next/server";
import { getInsightRows, type InsightRow } from "@/lib/queries/insights";

const KPI_FIELD_MAP = {
  evidenceDensity: "kpiEvidenceDensity",
  solutionSpecificity: "kpiSolutionSpecificity",
  interrogationDepth: "kpiInterrogationDepth",
  commitmentRate: "kpiCommitmentRate",
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const member = searchParams.get("member");
  const meeting = searchParams.get("meeting");
  const minKpi = searchParams.get("minKpi") as keyof typeof KPI_FIELD_MAP | null;
  const minValue = searchParams.get("minValue") ? Number(searchParams.get("minValue")) : null;

  const rows = await getInsightRows();
  const filtered = rows.filter((r) => {
    if (member && r.memberName !== member) return false;
    if (meeting && r.meetingTitle !== meeting) return false;
    if (minKpi && minValue !== null) {
      const field = KPI_FIELD_MAP[minKpi];
      const value = (r as unknown as Record<string, number | null>)[field];
      if (value === null || value < minValue) return false;
    }
    return true;
  });

  return NextResponse.json(filtered, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
