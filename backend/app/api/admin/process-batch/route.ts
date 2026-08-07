import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { getPendingStatementIds, processOneStatement, countPendingStatements } from "@/lib/pipeline/processStatement";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10; // worst case ~10 * 39s (retries + delay) stays under maxDuration

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const json = await request.json().catch(() => ({}));
  const requestedLimit = typeof json.limit === "number" ? json.limit : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);

  const ids = await getPendingStatementIds(limit);

  let processed = 0;
  let excluded = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await processOneStatement(id);
    if (result.outcome === "processed") processed++;
    else if (result.outcome === "excluded") excluded++;
    else failed++;
  }

  const remaining = await countPendingStatements();
  return NextResponse.json({ processed, excluded, failed, remaining });
}
