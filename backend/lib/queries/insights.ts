import { db } from "@/db/client";
import { meetings, members, statements, statementInsights, agendaItems, issueTickets, issueReviews } from "@/db/schema";
import { asc, eq, isNull } from "drizzle-orm";
import { normalizeMemberName } from "@/lib/members/roster";
import { computeIssuePersistenceGrade, type Grade } from "@/lib/scoring/kpi";

// CLAUDE.md §1.1 "발언자 비율" 원칙의 실체적 적용: 의사진행 발언·비의원 발언만 있어 평가할
// 내용이 전혀 없는 회의는 목록에서 제외한다. 이름 정규화(normalizeMemberName) 이후 집계해야
// "부의장 임수환"과 "임수환"이 서로 다른 두 명으로 잘못 세지 않는다.
// v2.1(2026-08-12)에서 3→1로 하향: 5분자유발언 참석자가 다수이고 안건 토의 참여자가 실제로
// 1명뿐인 회의(예: 264회 본회의 제2차)가 통째로 걸러지는 부작용이 있어, "표본이 아예 없는
// 회의만 제외"로 게이트를 완화했다. 표본이 1명뿐인 회의를 회의 간 비교에 쓸 때는 그 한계를
// 감안해야 한다.
const MIN_SUBSTANTIVE_MEMBERS_PER_MEETING = 1;

export interface InsightRow {
  statementId: number;
  meetingId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  hasQaStructure: boolean;
  citations: { type: "L" | "S" | "P" | "F"; text: string }[];
  kpiEvidenceDensity: number | null;
  kpiEvidenceDensityGrade: string | null;
  proposals: { budget: boolean; timeline: boolean; subject: boolean; method: boolean }[];
  kpiSolutionSpecificity: number | null;
  qaRounds: { roundIndex: number; answerGrade: string; bonusTags: string[] }[];
  kpiInterrogationDepth: number | null;
  kpiReQuestionRate: number | null;
  kpiCommitmentRate: number | null;
  selfRaisedIssues: { description: string }[];
  summary: string;
  rawText: string;
  rationale: string;
}

export async function getInsightRows(): Promise<InsightRow[]> {
  // excludedReason IS NULL ⇒ CLAUDE.md §1.2 procedural turns and non-member speakers
  // never reach this list — they were never signal-extracted by Sonnet 5 in the first
  // place. This filter guarantees every row returned here was a real member statement;
  // individual KPI values can still be legitimately null (KPI1 evidence density needs a
  // speech-duration source, KPI2 solution specificity needs at least one proposal, KPI3/4
  // need `hasQaStructure` — see docs/rubric/CLAUDE.md §3 for the N/A rules per KPI).
  const [rows, meetingsWithAgendaItems] = await Promise.all([
    db
      .select({
        statementId: statements.id,
        meetingId: statements.meetingId,
        meetingTitle: meetings.title,
        memberName: members.name,
        tags: statementInsights.tags,
        topicsToWatch: statementInsights.topicsToWatch,
        speechType: statementInsights.speechType,
        hasQaStructure: statementInsights.hasQaStructure,
        citations: statementInsights.citations,
        kpiEvidenceDensity: statementInsights.kpiEvidenceDensity,
        kpiEvidenceDensityGrade: statementInsights.kpiEvidenceDensityGrade,
        proposals: statementInsights.proposals,
        kpiSolutionSpecificity: statementInsights.kpiSolutionSpecificity,
        qaRounds: statementInsights.qaRounds,
        kpiInterrogationDepth: statementInsights.kpiInterrogationDepth,
        kpiReQuestionRate: statementInsights.kpiReQuestionRate,
        kpiCommitmentRate: statementInsights.kpiCommitmentRate,
        selfRaisedIssues: statementInsights.selfRaisedIssues,
        summary: statementInsights.summary,
        rawText: statements.rawText,
        rationale: statementInsights.rationale,
      })
      .from(statementInsights)
      .innerJoin(statements, eq(statementInsights.statementId, statements.id))
      .innerJoin(meetings, eq(statements.meetingId, meetings.id))
      .innerJoin(members, eq(statements.memberId, members.id))
      .where(isNull(statementInsights.excludedReason)),

    // 부의된 안건(formally-tabled agenda item) 게이트: CLAUDE.md §1.1 "부의된 안건이 있는
    // 회의만 평가". 회의가 agendaItems 0건이면 부의된 안건이 없는 것과 동치다 —
    // upsertMeeting.ts는 minutes.ts가 5분자유발언 발언을 걷어낸 뒤 살아남은 발언들로부터
    // agendaItems를 파생시키므로(별도의 "안건 목록" 직접 읽기가 아님), 별도 HTML 파싱이 필요 없다.
    // JOIN이 아니라 별도 쿼리로 병렬 실행하는 이유: agendaItems는 회의당 1:N이라, meetings에
    // 직접 JOIN하면 위 statementInsights 기본 행이 안건 개수만큼 중복된다.
    db.selectDistinct({ meetingId: agendaItems.meetingId }).from(agendaItems),
  ]);

  const meetingIdsWithAgendaItems = new Set(meetingsWithAgendaItems.map((r) => r.meetingId));

  const normalized = rows.map((r) => ({
    ...r,
    memberName: normalizeMemberName(r.memberName),
    tags: r.tags ?? [],
    topicsToWatch: r.topicsToWatch ?? [],
    speechType: r.speechType!,
    citations: r.citations ?? [],
    kpiEvidenceDensity: r.kpiEvidenceDensity === null ? null : Number(r.kpiEvidenceDensity),
    proposals: r.proposals ?? [],
    kpiSolutionSpecificity: r.kpiSolutionSpecificity === null ? null : Number(r.kpiSolutionSpecificity),
    qaRounds: r.qaRounds ?? [],
    kpiInterrogationDepth: r.kpiInterrogationDepth === null ? null : Number(r.kpiInterrogationDepth),
    kpiReQuestionRate: r.kpiReQuestionRate === null ? null : Number(r.kpiReQuestionRate),
    kpiCommitmentRate: r.kpiCommitmentRate === null ? null : Number(r.kpiCommitmentRate),
    selfRaisedIssues: r.selfRaisedIssues ?? [],
    rationale: r.rationale ?? "",
  }));

  const membersByMeetingId = new Map<number, Set<string>>();
  for (const r of normalized) {
    const set = membersByMeetingId.get(r.meetingId) ?? new Set<string>();
    set.add(r.memberName);
    membersByMeetingId.set(r.meetingId, set);
  }
  const qualifyingMeetingIds = new Set(
    [...membersByMeetingId.entries()]
      .filter(([, memberSet]) => memberSet.size >= MIN_SUBSTANTIVE_MEMBERS_PER_MEETING)
      .map(([meetingId]) => meetingId)
  );

  return normalized.filter(
    (r) => qualifyingMeetingIds.has(r.meetingId) && meetingIdsWithAgendaItems.has(r.meetingId)
  );
}

const MIN_SESSIONS_FOR_RATE = 3;

export interface MemberIssuePersistence {
  memberName: string;
  totalIssues: number;
  reviewedIssues: number;
  rate: number | null;
  grade: Grade | null;
  status: "scored" | "tracking";
}

/**
 * KPI⑤는 의원 누적 단위 — statementInsights가 아니라 issueTickets/issueReviews를 집계한다.
 * 이력이 MIN_SESSIONS_FOR_RATE회기 미만인 의원은 비율 대신 "tracking"으로 표시한다
 * (docs/rubric/CLAUDE.md §3⑤ "추적 중").
 */
export async function getMemberIssuePersistence(): Promise<MemberIssuePersistence[]> {
  const ticketRows = await db
    .select({
      memberName: members.name,
      ticketId: issueTickets.id,
      registeredMeetingId: issueTickets.registeredMeetingId,
    })
    .from(issueTickets)
    .innerJoin(members, eq(issueTickets.memberId, members.id));

  const reviewedTicketIds = new Set(
    (await db.select({ ticketId: issueReviews.ticketId }).from(issueReviews)).map((r) => r.ticketId)
  );

  const byMember = new Map<string, { total: number; reviewed: number; meetingIds: Set<number> }>();
  for (const row of ticketRows) {
    const name = normalizeMemberName(row.memberName);
    const entry = byMember.get(name) ?? { total: 0, reviewed: 0, meetingIds: new Set<number>() };
    entry.total += 1;
    if (reviewedTicketIds.has(row.ticketId)) entry.reviewed += 1;
    entry.meetingIds.add(row.registeredMeetingId);
    byMember.set(name, entry);
  }

  return [...byMember.entries()].map(([memberName, entry]) => {
    if (entry.meetingIds.size < MIN_SESSIONS_FOR_RATE) {
      return { memberName, totalIssues: entry.total, reviewedIssues: entry.reviewed, rate: null, grade: null, status: "tracking" as const };
    }
    const rate = Math.round((entry.reviewed / entry.total) * 100) / 100;
    return { memberName, totalIssues: entry.total, reviewedIssues: entry.reviewed, rate, grade: computeIssuePersistenceGrade(rate), status: "scored" as const };
  });
}

export interface OpenIssueTicket {
  id: number;
  memberName: string;
  description: string;
  reviewCheckpoint: string | null;
  status: string;
  registeredStatementId: number;
}

/**
 * "이슈추적사항" 탭용 — 아직 재검토되지 않은(open) 이슈 티켓을 의원명 정규화해서 반환한다.
 * KPI5(사후책임성)의 의원 단위 집계(getMemberIssuePersistence)와 달리, 이건 개별 티켓의
 * 정적 목록이다.
 */
export async function getOpenIssueTickets(): Promise<OpenIssueTicket[]> {
  const rows = await db
    .select({
      id: issueTickets.id,
      memberName: members.name,
      description: issueTickets.description,
      reviewCheckpoint: issueTickets.reviewCheckpoint,
      status: issueTickets.status,
      registeredStatementId: issueTickets.registeredStatementId,
    })
    .from(issueTickets)
    .innerJoin(members, eq(issueTickets.memberId, members.id))
    .where(eq(issueTickets.status, "open"))
    .orderBy(asc(issueTickets.id));

  return rows.map((r) => ({ ...r, memberName: normalizeMemberName(r.memberName) }));
}
