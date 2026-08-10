// mobile/src/lib/api.ts
import { MEMBER_ROSTER } from "./memberRoster";

export interface InsightRow {
  statementId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  creativity: number | null;
  feasibility: number;
  evidenceLegal: number;
  persistence: number | null;
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

export interface InsightFilters {
  member?: string;
  meeting?: string;
  minWeightedScore?: number;
}

export async function fetchInsights(filters: InsightFilters = {}): Promise<InsightRow[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.meeting) params.set("meeting", filters.meeting);
  if (filters.minWeightedScore) params.set("minWeightedScore", String(filters.minWeightedScore));

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
  /** 이 회의에서 해당 의원의 발언 중 가중평균이 가장 높은 대표 발언. */
  representative: InsightRow;
  /** 같은 회의·같은 의원의 나머지 발언(대표 제외), 가중평균 내림차순. */
  siblings: InsightRow[];
}

/**
 * 한 의원이 한 회의에서 여러 건의 유효 발언을 했을 때(예: 위원회 배정을 놓고 의장과
 * 여러 차례 주고받은 실랑이 중 실질 내용이 담긴 발언만 개별 채점된 경우), 표1에는
 * 회의당 의원 1행만 노출하기 위한 그룹화. 가중평균이 가장 높은 발언을 대표로 삼는다 —
 * 나머지 발언은 버리지 않고 표2 상세에서 "이 회의의 다른 발언"으로 계속 보여준다.
 */
export function groupByMemberMeeting(rows: InsightRow[]): InsightGroup[] {
  const byKey = new Map<string, InsightRow[]>();
  for (const row of rows) {
    const key = `${row.meetingTitle}::${row.memberName}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  return [...byKey.values()].map((group) => {
    const sorted = [...group].sort((a, b) => b.weightedScore - a.weightedScore);
    return { representative: sorted[0], siblings: sorted.slice(1) };
  });
}

export interface InsightMemberGroup {
  memberName: string;
  /** 이 의원의 모든 회의 대표 발언 중 가중평균이 가장 높은 발언 — 태그/요약/링크 대상으로 쓴다. */
  representative: InsightRow;
  /** 이 의원이 발언한 각 회의의 대표 발언 가중평균을 산술평균한 값. */
  averageScore: number;
  /** 이 의원이 실질 발언한 회의 수. */
  meetingCount: number;
}

/**
 * 표1 개요(전체 발언 랭킹)의 "전체회의" 보기용: groupByMemberMeeting()이 회의별로 쪼개놓은
 * 대표 발언들을 의원 단위로 한 번 더 묶어 의원당 1행만 노출한다. 평가점수는 그 의원이 발언한
 * 회의들의 대표 발언 가중평균을 산술평균한 값이다(회의 하나만 걸러져 있을 때는 그 회의의
 * 대표 발언 점수와 동일해지므로, 단일 회의 보기에도 그대로 재사용할 수 있다).
 */
export function groupByMember(rows: InsightRow[]): InsightMemberGroup[] {
  const byMember = new Map<string, InsightGroup[]>();
  for (const group of groupByMemberMeeting(rows)) {
    const list = byMember.get(group.representative.memberName) ?? [];
    list.push(group);
    byMember.set(group.representative.memberName, list);
  }

  return [...byMember.entries()].map(([memberName, groups]) => {
    const representative = groups.reduce((best, g) =>
      g.representative.weightedScore > best.representative.weightedScore ? g : best
    ).representative;
    const averageScore = groups.reduce((sum, g) => sum + g.representative.weightedScore, 0) / groups.length;
    return { memberName, representative, averageScore, meetingCount: groups.length };
  });
}

/**
 * 표2 상세 화면용: 대상 발언과, 같은 회의·같은 의원의 다른 발언들(가중평균 내림차순)을
 * 함께 반환한다. 이미 fetchInsights()로 받아온 배열에서 파생하므로 API를 새로 호출하지 않는다.
 */
export async function fetchInsightWithSiblings(
  id: number
): Promise<{ row: InsightRow; siblings: InsightRow[] } | null> {
  const rows = await fetchInsights();
  const row = rows.find((r) => r.statementId === id);
  if (!row) return null;

  const siblings = rows
    .filter((r) => r.statementId !== id && r.meetingTitle === row.meetingTitle && r.memberName === row.memberName)
    .sort((a, b) => b.weightedScore - a.weightedScore);

  return { row, siblings };
}
