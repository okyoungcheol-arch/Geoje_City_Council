// mobile/src/lib/kpis.ts
//
// docs/rubric/CLAUDE.md §3의 5-KPI 표시용 상수. mobile은 backend 코드를 import하지 않으므로
// (CLAUDE.md 제약) 여기서 라벨만 직접 유지한다 — KPI 산식/등급 경계값 자체는 backend
// (backend/lib/scoring/kpi.ts)가 단일 진실 소스다.

import type { InsightRow } from "./api";

export type Kpi = "evidenceDensity" | "solutionSpecificity" | "interrogationDepth" | "commitmentRate";

export const KPIS: Kpi[] = ["evidenceDensity", "solutionSpecificity", "interrogationDepth", "commitmentRate"];

export const KPI_LABELS: Record<Kpi, string> = {
  evidenceDensity: "사전준비도",
  solutionSpecificity: "정책생산력",
  interrogationDepth: "실시간 압박력",
  commitmentRate: "성과전환력",
};

const KPI_FIELD: Record<Kpi, keyof InsightRow> = {
  evidenceDensity: "kpiEvidenceDensity",
  solutionSpecificity: "kpiSolutionSpecificity",
  interrogationDepth: "kpiInterrogationDepth",
  commitmentRate: "kpiCommitmentRate",
};

/** N/A(null)와 실제 값을 하나의 셀 표시 문자열로 통일한다. */
export function kpiCellLabel(row: InsightRow, kpi: Kpi): string {
  const value = row[KPI_FIELD[kpi]] as number | null;
  if (value === null) return "―";
  if (kpi === "commitmentRate") return `${Math.round(value * 100)}%`;
  if (kpi === "evidenceDensity") return `${value.toFixed(2)}${row.kpiEvidenceDensityGrade ? `(${row.kpiEvidenceDensityGrade})` : ""}`;
  return value.toFixed(2);
}

/** backend/app/table1/Table1Client.tsx의 meetingShortTitle()과 동일한 규칙 — 변경 없음. */
export function meetingShortTitle(fullTitle: string): string {
  return fullTitle.split("\n")[0].trim();
}

/** 변경 없음 — mobile/src/lib/axes.ts에서 그대로 이동. */
export function meetingSessionTitle(fullTitle: string): string {
  const firstLine = meetingShortTitle(fullTitle);
  const match = firstLine.match(/^거제시의회\s*제10대\s*(.+?)\s*회의록\s*$/);
  return match ? match[1].trim() : firstLine;
}
