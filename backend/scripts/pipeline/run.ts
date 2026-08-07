// backend/scripts/pipeline/run.ts
import { getPendingStatementIds, processOneStatement } from "@/lib/pipeline/processStatement";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const pendingIds = await getPendingStatementIds();
  const total = pendingIds.length;
  console.log(`Starting run: ${total} pending statements`);

  let i = 0;
  for (const id of pendingIds) {
    i++;
    if (i % 25 === 0) console.log(`--- progress: ${i}/${total} ---`);

    const result = await processOneStatement(id);
    if (result.outcome === "processed") {
      console.log(`Processed statement ${result.statementId}`);
    } else if (result.outcome === "excluded") {
      console.log(`Excluded statement ${result.statementId} (${result.reason})`);
    } else {
      console.error(`Failed statement ${result.statementId}: ${result.reason}`);
    }

    // Politeness delay between statements — avoids re-triggering the account's
    // Opus 5 burst rate limit.
    await sleep(4000);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
