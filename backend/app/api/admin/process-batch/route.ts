import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { getPendingStatementIds, processOneStatement, countPendingStatements } from "@/lib/pipeline/processStatement";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 3;
// Conservative limit to stay safely under maxDuration=300s.
// Each statement calls withRetry twice (summarizeStatement, scoreStatement), each with up to 3 attempts
// and backoff sleeps (35s+ per exhausted withRetry). Worst case per statement: ~70-100s+ when retries
// are exhausted. With MAX_LIMIT=3, worst case ~210-300s total, leaving safety margin for DB queries.
// Real production latency will tune this further, but 3 is defensibly conservative for now.

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
    try {
      const result = await processOneStatement(id);
      if (result.outcome === "processed") processed++;
      else if (result.outcome === "excluded") excluded++;
      else failed++;
    } catch (error) {
      failed++;
      console.error(`Error processing statement ${id}:`, error);
    }
  }

  const remaining = await countPendingStatements();
  return NextResponse.json({ processed, excluded, failed, remaining });
}
