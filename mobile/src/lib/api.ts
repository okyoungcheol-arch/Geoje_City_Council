// mobile/src/lib/api.ts
import { MEMBER_ROSTER } from "./memberRoster";
import type { Kpi } from "./kpis";

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

export interface InsightFilters {
  member?: string;
  meeting?: string;
  minKpi?: "evidenceDensity" | "solutionSpecificity" | "interrogationDepth" | "commitmentRate";
  minValue?: number;
}

export async function fetchInsights(filters: InsightFilters = {}): Promise<InsightRow[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.meeting) params.set("meeting", filters.meeting);
  if (filters.minKpi) params.set("minKpi", filters.minKpi);
  if (filters.minValue !== undefined) params.set("minValue", String(filters.minValue));

  const res = await fetch(`${base}/api/insights?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`);
  const rows: InsightRow[] = await res.json();

  // backend/lib/members/isNonMemberSpeaker.ts만으로는 "상임이사"/"…부장" 같은 비의원 직함을
  // 다 걸러내지 못해, 의원이 아닌 발언자의 통계도 statementInsights에 남아 있을 수 있다.
  // 표시 화면은 항상 의정활동(council member) 대상이어야 하므로 여기서 한 번 더 걸러낸다.
  return rows.filter((r) => MEMBER_ROSTER.has(r.memberName));
}

export async function fetchInsightById(id: number): Promise<InsightRow | null> {
  const rows = await fetchInsights();
  return rows.find((r) => r.statementId === id) ?? null;
}

export interface InsightGroup {
  /** 이 회의에서 해당 의원의 발언 중 선택된 KPI가 가장 높은 대표 발언. */
  representative: InsightRow;
  /** 같은 회의·같은 의원의 나머지 발언(대표 제외), 선택된 KPI 내림차순. */
  siblings: InsightRow[];
}

const KPI_FIELD: Record<Kpi, keyof InsightRow> = {
  evidenceDensity: "kpiEvidenceDensity",
  solutionSpecificity: "kpiSolutionSpecificity",
  interrogationDepth: "kpiInterrogationDepth",
  commitmentRate: "kpiCommitmentRate",
};

function kpiValue(row: InsightRow, kpi: Kpi): number {
  return (row[KPI_FIELD[kpi]] as number | null) ?? -Infinity; // N/A sorts last on desc
}

/**
 * 한 의원이 한 회의에서 여러 건의 유효 발언을 했을 때 표1에는 회의당 의원 1행만 노출하기 위한
 * 그룹화. 대표 발언은 주어진 kpi 기준 최댓값(N/A는 최하위로 취급)을 가진 발언으로 정한다.
 */
export function groupByMemberMeeting(rows: InsightRow[], kpi: Kpi = "evidenceDensity"): InsightGroup[] {
  const byKey = new Map<string, InsightRow[]>();
  for (const row of rows) {
    const key = `${row.meetingTitle}::${row.memberName}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  return [...byKey.values()].map((group) => {
    const sorted = [...group].sort((a, b) => kpiValue(b, kpi) - kpiValue(a, kpi));
    return { representative: sorted[0], siblings: sorted.slice(1) };
  });
}

/**
 * 표2 상세 화면용: 대상 발언과, 같은 회의·같은 의원의 다른 발언들(사전준비도 내림차순)을
 * 함께 반환한다. 이미 fetchInsights()로 받아온 배열에서 파생하므로 API를 새로 호출하지 않는다.
 * 상세화면에서는 어차피 모든 KPI를 다 보여주므로 정렬 기준은 항상 사전준비도로 고정한다.
 */
export async function fetchInsightWithSiblings(
  id: number
): Promise<{ row: InsightRow; siblings: InsightRow[] } | null> {
  const rows = await fetchInsights();
  const row = rows.find((r) => r.statementId === id);
  if (!row) return null;

  const siblings = rows
    .filter((r) => r.statementId !== id && r.meetingTitle === row.meetingTitle && r.memberName === row.memberName)
    .sort((a, b) => (b.kpiEvidenceDensity ?? -Infinity) - (a.kpiEvidenceDensity ?? -Infinity));

  return { row, siblings };
}

export interface MemberIssuePersistence {
  memberName: string;
  totalIssues: number;
  reviewedIssues: number;
  rate: number | null;
  grade: string | null;
  status: "scored" | "tracking";
}

export async function fetchIssuePersistence(): Promise<MemberIssuePersistence[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const res = await fetch(`${base}/api/issue-persistence`);
  if (!res.ok) throw new Error(`Failed to fetch issue persistence: ${res.status}`);
  return res.json();
}

export interface IssueTicket {
  id: number;
  memberName: string;
  description: string;
  reviewCheckpoint: string | null;
  status: string;
  registeredStatementId: number;
}

/** "이슈추적사항" 탭용 — 아직 재검토되지 않은(open) 이슈 티켓 목록. */
export async function fetchIssueTickets(): Promise<IssueTicket[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const res = await fetch(`${base}/api/issue-tickets`);
  if (!res.ok) throw new Error(`Failed to fetch issue tickets: ${res.status}`);
  return res.json();
}
