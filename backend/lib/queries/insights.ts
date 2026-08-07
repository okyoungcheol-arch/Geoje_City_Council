import { db } from "@/db/client";
import { meetings, members, statements, statementInsights } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

export interface InsightRow {
  statementId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  creativity: number | null; // null only when the axis weight is "―(제외)" for this speechType
  feasibility: number;
  evidenceLegal: number;
  persistence: number | null; // null when persistenceStatus is pending_future_evaluation
  persistenceStatus: string;
  oversight: number;
  citizenBenefit: number;
  futureStrategy: number;
  cityDevelopment: number;
  weightedScore: number;
  summary: string;
  rawText: string;
  rationale: string;
}

export async function getInsightRows(): Promise<InsightRow[]> {
  // excludedReason IS NULL ⇒ CLAUDE.md §1.2 procedural turns and non-member speakers
  // never reach this list — they were never scored by Opus 5 in the first place. This
  // filter guarantees every row returned here has real, non-null Opus 5 scores (except
  // creativity, which can be legitimately null under the budget_review "―(제외)" weight,
  // and persistence, which can be legitimately null under pending_future_evaluation).
  const rows = await db
    .select({
      statementId: statements.id,
      meetingTitle: meetings.title,
      memberName: members.name,
      tags: statementInsights.tags,
      topicsToWatch: statementInsights.topicsToWatch,
      speechType: statementInsights.speechType,
      creativity: statementInsights.creativity,
      feasibility: statementInsights.feasibility,
      evidenceLegal: statementInsights.evidenceLegal,
      persistence: statementInsights.persistence,
      persistenceStatus: statementInsights.persistenceStatus,
      oversight: statementInsights.oversight,
      citizenBenefit: statementInsights.citizenBenefit,
      futureStrategy: statementInsights.futureStrategy,
      cityDevelopment: statementInsights.cityDevelopment,
      weightedScore: statementInsights.weightedScore,
      summary: statementInsights.summary,
      rawText: statements.rawText,
      rationale: statementInsights.rationale,
    })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .innerJoin(members, eq(statements.memberId, members.id))
    .where(isNull(statementInsights.excludedReason));

  return rows.map((r) => ({
    ...r,
    tags: r.tags ?? [],
    topicsToWatch: r.topicsToWatch ?? [],
    speechType: r.speechType!,
    feasibility: r.feasibility!,
    evidenceLegal: r.evidenceLegal!,
    persistenceStatus: r.persistenceStatus!,
    oversight: r.oversight!,
    citizenBenefit: r.citizenBenefit!,
    futureStrategy: r.futureStrategy!,
    cityDevelopment: r.cityDevelopment!,
    weightedScore: Number(r.weightedScore),
    rationale: r.rationale!,
  }));
}
