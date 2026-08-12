// backend/scripts/migrate/recompute-interrogation-depth.ts
//
// docs/rubric/CLAUDE.md §3③ v2.1: 실시간압박력(구 추궁심도) 공식이 "가산 태그 합산"에서
// "왕복 턴 수만"으로 바뀌었고, 가산 태그 "회피차단"도 "쟁점고정"으로 이름이 바뀌었다. 이미
// 채점된 발언들의 qaRounds jsonb는 그대로 두고, 그로부터 파생되는 kpiInterrogationDepth·
// kpiReQuestionRate·bonusTags 표기만 순수 코드로 재계산한다(AI 재호출 없음, 멱등적).
import { db } from "@/db/client";
import { statementInsights } from "@/db/schema";
import { isNotNull, eq } from "drizzle-orm";
import { computeInterrogationDepth } from "@/lib/scoring/kpi";
import type { QaRound } from "@/lib/ai/extractQaRounds";

async function run() {
  const rows = await db
    .select({ id: statementInsights.id, qaRounds: statementInsights.qaRounds })
    .from(statementInsights)
    .where(isNotNull(statementInsights.qaRounds));

  console.log(`Found ${rows.length} statement_insights rows with qaRounds to recompute.`);

  let updated = 0;
  for (const row of rows) {
    const qaRounds = (row.qaRounds ?? []) as QaRound[];
    if (qaRounds.length === 0) continue;

    const renamedRounds = qaRounds.map((r) => ({
      ...r,
      bonusTags: r.bonusTags.map((tag) => (tag === "회피차단" ? "쟁점고정" : tag)),
    }));

    const depth = computeInterrogationDepth(renamedRounds);
    if (depth === null) continue;

    await db
      .update(statementInsights)
      .set({
        qaRounds: renamedRounds,
        kpiInterrogationDepth: String(depth.value),
        kpiReQuestionRate: String(depth.reQuestionRate),
      })
      .where(eq(statementInsights.id, row.id));
    updated++;
  }

  console.log(`Recomputed ${updated} rows (skipped ${rows.length - updated} with empty qaRounds).`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
