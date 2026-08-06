import { db } from "@/db/client";
import { meetings, members, statements, statementInsights } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface InsightRow {
  statementId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  learningLevel: number;
  questionScore: number;
  ideaScore: number;
  feasibilityScore: number;
  geojeImpactScore: number;
  summary: string;
  rawText: string;
  rationale: string;
}

export async function getInsightRows(): Promise<InsightRow[]> {
  return db
    .select({
      statementId: statements.id,
      meetingTitle: meetings.title,
      memberName: members.name,
      tags: statementInsights.tags,
      learningLevel: statementInsights.learningLevel,
      questionScore: statementInsights.questionScore,
      ideaScore: statementInsights.ideaScore,
      feasibilityScore: statementInsights.feasibilityScore,
      geojeImpactScore: statementInsights.geojeImpactScore,
      summary: statementInsights.summary,
      rawText: statements.rawText,
      rationale: statementInsights.rationale,
    })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .innerJoin(members, eq(statements.memberId, members.id));
}
