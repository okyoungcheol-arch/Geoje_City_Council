// mobile/src/lib/api.ts
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
  return res.json();
}

export async function fetchInsightById(id: number): Promise<InsightRow | null> {
  const rows = await fetchInsights();
  return rows.find((r) => r.statementId === id) ?? null;
}
