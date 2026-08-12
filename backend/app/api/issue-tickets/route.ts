import { NextResponse } from "next/server";
import { getOpenIssueTickets } from "@/lib/queries/insights";

export async function GET() {
  const rows = await getOpenIssueTickets();
  return NextResponse.json(rows, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
