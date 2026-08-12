import { NextResponse } from "next/server";
import { getMemberIssuePersistence } from "@/lib/queries/insights";

export async function GET() {
  const rows = await getMemberIssuePersistence();
  return NextResponse.json(rows, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
