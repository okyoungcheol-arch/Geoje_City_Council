import { db } from "@/db/client";
import { meetings, members, statements, statementInsights } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import { normalizeMemberName } from "@/lib/members/roster";

// CLAUDE.md §1.1 "발언자 비율" 원칙의 실체적 적용: 의사진행 발언·비의원 발언만 있어
// 평가할 내용이 없는 회의, 또는 실질 발언 의원이 소수(1~2명)라 표본으로 의미가 약한 회의는
// 목록에서 제외한다. 이름 정규화(normalizeMemberName) 이후 집계해야 "부의장 임수환"과
// "임수환"이 서로 다른 두 명으로 잘못 세지 않는다.
const MIN_SUBSTANTIVE_MEMBERS_PER_MEETING = 3;

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

  const normalized = rows.map((r) => ({
    ...r,
    memberName: normalizeMemberName(r.memberName),
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

  const membersByMeeting = new Map<string, Set<string>>();
  for (const r of normalized) {
    const set = membersByMeeting.get(r.meetingTitle) ?? new Set<string>();
    set.add(r.memberName);
    membersByMeeting.set(r.meetingTitle, set);
  }
  const qualifyingMeetings = new Set(
    [...membersByMeeting.entries()]
      .filter(([, memberSet]) => memberSet.size >= MIN_SUBSTANTIVE_MEMBERS_PER_MEETING)
      .map(([title]) => title)
  );

  return normalized.filter((r) => qualifyingMeetings.has(r.meetingTitle));
}
