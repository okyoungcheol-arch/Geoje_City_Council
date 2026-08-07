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
      // roughly 1 request lands per ~5 back-to-back attempts). 5s/10s/20s backoff.
      await sleep(5000 * 2 ** i);
    }
  }
  throw lastErr;
}

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

export async function getPendingStatementIds(limit?: number): Promise<number[]> {
  const alreadyProcessed = await db.select({ statementId: statementInsights.statementId }).from(statementInsights);
  const processedIds = alreadyProcessed.map((r) => r.statementId);
  const base = processedIds.length
    ? db.select({ id: statements.id }).from(statements).where(notInArray(statements.id, processedIds))
    : db.select({ id: statements.id }).from(statements);
  const rows = limit ? await base.limit(limit) : await base;
  return rows.map((s) => s.id);
}

export async function countPendingStatements(): Promise<number> {
  const allIds = await db.select({ id: statements.id }).from(statements);
  const processedRows = await db.select({ statementId: statementInsights.statementId }).from(statementInsights);
  const processedSet = new Set(processedRows.map((r) => r.statementId));
  return allIds.filter((s) => !processedSet.has(s.id)).length;
}

export type ProcessOutcome = "processed" | "excluded" | "failed";
export interface ProcessResult {
  statementId: number;
  outcome: ProcessOutcome;
  reason?: string;
}

export async function processOneStatement(statementId: number): Promise<ProcessResult> {
  const [stmt] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!stmt) return { statementId, outcome: "failed", reason: "statement not found" };

  const [member] = await db.select().from(members).where(eq(members.id, stmt.memberId));
  const agendaTitle = stmt.agendaItemId
    ? (await db.select().from(agendaItems).where(eq(agendaItems.id, stmt.agendaItemId)))[0]?.title ?? null
    : null;

  if (isNonMemberSpeaker(member.name)) {
    await db.insert(statementInsights).values({
      statementId: stmt.id,
      summary: stmt.rawText.slice(0, 200),
      tags: [],
      excludedReason: "의원 아님(집행부/사무국)",
      sonnetModel: "n/a",
    });
    return { statementId, outcome: "excluded", reason: "의원 아님(집행부/사무국)" };
  }

  try {
    const { summary, tags, isProcedural, speechType } = await withRetry(() =>
      summarizeStatement(stmt.rawText, agendaTitle)
    );

    if (isProcedural) {
      await db.insert(statementInsights).values({
        statementId: stmt.id,
        summary,
        tags,
        excludedReason: "의사진행 발언",
        sonnetModel: "claude-sonnet-5",
      });
      return { statementId, outcome: "excluded", reason: "의사진행 발언" };
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

    return { statementId, outcome: "processed" };
  } catch (err) {
    return { statementId, outcome: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
