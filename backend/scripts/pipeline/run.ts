// backend/scripts/pipeline/run.ts
import { db } from "@/db/client";
import { statements, statementInsights, members, meetings, agendaItems } from "@/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { summarizeStatement } from "@/lib/ai/summarize";
import { scoreStatement, type PriorStatementContext } from "@/lib/ai/score";
import { computeWeightedScore, type AxisScores } from "@/lib/scoring/weightedAverage";
import { isNonMemberSpeaker } from "@/lib/members/isNonMemberSpeaker";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Account is on a strict burst rate limit for claude-opus-5 (observed:
      // roughly 1 request lands per ~5 back-to-back attempts). 1s/2s/4s backoff
      // was too short to clear the window; use 5s/10s/20s instead.
      await sleep(5000 * 2 ** i);
    }
  }
  throw lastErr;
}

// CLAUDE.md §3④: persistence is only ever scored when the prompt is given real prior-
// session context. Look up this member's own previously-scored (non-excluded) statements
// from earlier meetings, most recent first, capped small to keep the prompt short.
async function getPriorContext(memberId: number, currentMeetingId: number): Promise<PriorStatementContext[]> {
  const rows = await db
    .select({ meetingTitle: meetings.title, summary: statementInsights.summary, meetingId: statements.meetingId })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .where(and(eq(statements.memberId, memberId), isNull(statementInsights.excludedReason)))
    .orderBy(statements.meetingId)
    .limit(3);

  return rows.filter((r) => r.meetingId !== currentMeetingId).map((r) => ({ meetingTitle: r.meetingTitle, summary: r.summary }));
}

async function run() {
  const alreadyProcessed = await db.select({ statementId: statementInsights.statementId }).from(statementInsights);
  const processedIds = alreadyProcessed.map((r) => r.statementId);

  // INTENTIONAL CAP: `.limit(10)` pending human review of cost/quality on this 10-statement
  // sample (plan's Step 2→Step 3 checkpoint). Do NOT remove until the human explicitly
  // authorizes the full ~2412-statement batch run (real paid Sonnet 5 + Opus 5 calls).
  const pendingBase = processedIds.length
    ? db.select().from(statements).where(notInArray(statements.id, processedIds)).limit(10)
    : db.select().from(statements).limit(10);
  const pendingStatements = await pendingBase;

  const failures: { statementId: number; error: string }[] = [];

  for (const stmt of pendingStatements) {
    try {
      const [member] = await db.select().from(members).where(eq(members.id, stmt.memberId));
      const [meeting] = await db.select().from(meetings).where(eq(meetings.id, stmt.meetingId));
      const agendaTitle = stmt.agendaItemId
        ? (await db.select().from(agendaItems).where(eq(agendaItems.id, stmt.agendaItemId)))[0]?.title ?? null
        : null;

      if (isNonMemberSpeaker(member.name)) {
        // CLAUDE.md §1.2 (extended): 의원이 아닌 집행부/사무국 화자는 의정활동 평가 대상이
        // 아님. Skip AI entirely — no Sonnet call needed either, this is a name-pattern
        // check, not a content judgment.
        await db.insert(statementInsights).values({
          statementId: stmt.id,
          summary: stmt.rawText.slice(0, 200),
          tags: [],
          excludedReason: "의원 아님(집행부/사무국)",
          sonnetModel: "n/a",
        });
        console.log(`Excluded statement ${stmt.id} (의원 아님: ${member.name})`);
        continue;
      }

      const { summary, tags, isProcedural, speechType } = await withRetry(() =>
        summarizeStatement(stmt.rawText, agendaTitle)
      );

      if (isProcedural) {
        // CLAUDE.md §1.2: 의장 의사진행 발언 등은 평가 제외 대상 — no Opus 5 call,
        // no scores. Also conserves the account's currently scarce Opus 5 quota.
        await db.insert(statementInsights).values({
          statementId: stmt.id,
          summary,
          tags,
          excludedReason: "의사진행 발언",
          sonnetModel: "claude-sonnet-5",
        });
        console.log(`Excluded statement ${stmt.id} (의사진행 발언)`);
        await sleep(4000);
        continue;
      }

      const priorContext = await getPriorContext(stmt.memberId, stmt.meetingId);
      const scores = await withRetry(() => scoreStatement(stmt.rawText, summary, speechType, priorContext));

      const axisScores: AxisScores = {
        creativity: scores.creativity,
        feasibility: scores.feasibility,
        evidenceLegal: scores.evidenceLegal,
        persistence: scores.persistence,
        oversight: scores.oversight,
        citizenBenefit: scores.citizenBenefit,
        futureStrategy: scores.futureStrategy,
        cityDevelopment: scores.cityDevelopment,
      };
      const weightedScore = computeWeightedScore(axisScores, speechType);

      await db.insert(statementInsights).values({
        statementId: stmt.id,
        summary,
        tags,
        speechType,
        creativity: scores.creativity,
        feasibility: scores.feasibility,
        evidenceLegal: scores.evidenceLegal,
        persistence: scores.persistence,
        persistenceStatus: scores.persistence === null ? "pending_future_evaluation" : "scored",
        oversight: scores.oversight,
        citizenBenefit: scores.citizenBenefit,
        futureStrategy: scores.futureStrategy,
        cityDevelopment: scores.cityDevelopment,
        weightedScore: weightedScore === null ? null : String(weightedScore),
        topicsToWatch: scores.topicsToWatch,
        rationale: scores.rationale,
        sonnetModel: "claude-sonnet-5",
        opusModel: "claude-opus-5",
      });

      console.log(`Processed statement ${stmt.id} (${speechType}, weighted=${weightedScore})`);
    } catch (err) {
      failures.push({ statementId: stmt.id, error: String(err) });
      console.error(`Failed statement ${stmt.id}:`, err);
    }

    // Politeness delay between statements, same rationale as the scraper's
    // inter-request delay: avoids re-triggering the burst rate limit above.
    await sleep(4000);
  }

  if (failures.length) {
    console.error(`${failures.length} statements failed:`, failures);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
