// mobile/src/lib/axes.ts
//
// backend/lib/scoring/weightedAverage.ts + backend/app/table1/Table1Client.tsx의
// 표시용 상수를 값 그대로 복제한 파일이다. mobile은 backend 코드를 import하지 않으므로
// (CLAUDE.md 제약) 여기서 값을 직접 유지한다 — 백엔드 가중치표가 바뀌면 이 파일도
// 함께 갱신해야 한다. 가중평균 자체는 여기서 재계산하지 않는다.

export type Axis =
  | "creativity"
  | "feasibility"
  | "evidenceLegal"
  | "persistence"
  | "oversight"
  | "citizenBenefit"
  | "futureStrategy"
  | "cityDevelopment";

export const AXES: Axis[] = [
  "creativity",
  "feasibility",
  "evidenceLegal",
  "persistence",
  "oversight",
  "citizenBenefit",
  "futureStrategy",
  "cityDevelopment",
];

export const AXIS_LABELS: Record<Axis, string> = {
  creativity: "창의성",
  feasibility: "실현가능성",
  evidenceLegal: "근거·법적",
  persistence: "지속성",
  oversight: "견제력",
  citizenBenefit: "시민체감",
  futureStrategy: "미래전략",
  cityDevelopment: "거제발전",
};

export type SpeechType = "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal";

export const SPEECH_TYPE_LABELS: Record<SpeechType, string> = {
  five_min: "5분 이상 발언",
  budget_review: "예산·결산 심의",
  admin_audit: "행정사무감사",
  ordinance_proposal: "조례 발안 설명",
};

export const AXIS_WEIGHTS: Record<SpeechType, Record<Axis, number | null>> = {
  five_min: {
    creativity: 1.5,
    feasibility: 1.5,
    evidenceLegal: 1.5,
    persistence: 1.0,
    oversight: 0.5,
    citizenBenefit: 1.5,
    futureStrategy: 1.5,
    cityDevelopment: 1.0,
  },
  budget_review: {
    creativity: null,
    feasibility: 1.0,
    evidenceLegal: 2.0,
    persistence: 2.0,
    oversight: 2.0,
    citizenBenefit: 1.0,
    futureStrategy: 1.0,
    cityDevelopment: 0.5,
  },
  admin_audit: {
    creativity: 0.5,
    feasibility: 1.0,
    evidenceLegal: 2.0,
    persistence: 2.5,
    oversight: 2.5,
    citizenBenefit: 1.0,
    futureStrategy: 1.0,
    cityDevelopment: 0.5,
  },
  ordinance_proposal: {
    creativity: 1.5,
    feasibility: 2.0,
    evidenceLegal: 2.0,
    persistence: 2.0,
    oversight: 0.5,
    citizenBenefit: 1.5,
    futureStrategy: 1.5,
    cityDevelopment: 1.0,
  },
};

/**
 * backend/app/table1/Table1Client.tsx의 weightFootnote()와 동일한 규칙.
 * excludeAxes로 넘긴 축은 각주에서도 빼서, 화면에 표시하지 않는 축의 가중치가
 * 각주에만 남아 혼란을 주는 일이 없게 한다.
 */
export function weightFootnote(speechTypesUsed: SpeechType[], excludeAxes: Axis[] = []): string {
  const axesToShow = AXES.filter((a) => !excludeAxes.includes(a));
  return speechTypesUsed
    .map((st) => {
      const weights = AXIS_WEIGHTS[st];
      const parts = axesToShow.map((a) => `${AXIS_LABELS[a]} ${weights[a] === null ? "―(제외)" : weights[a]}`);
      return `[${SPEECH_TYPE_LABELS[st] ?? st}] ${parts.join(" · ")}`;
    })
    .join("\n");
}

/** 지속성 N/A("향후평가")와 일반 숫자 점수를 하나의 셀 표시 문자열로 통일한다. */
export function axisCellLabel(value: number | null, axis: Axis, persistenceStatus: string): string {
  if (axis === "persistence" && persistenceStatus === "pending_future_evaluation") return "향후평가";
  return value === null ? "―" : String(value);
}

/** backend/app/table1/Table1Client.tsx의 meetingShortTitle()과 동일한 규칙 — 첫 줄만 표시용으로 사용한다. */
export function meetingShortTitle(fullTitle: string): string {
  return fullTitle.split("\n")[0].trim();
}

/**
 * "거제시의회 제10대  제263회[임시회] 본회의 제2차 회의록" → "제263회[임시회] 본회의"처럼
 * "거제시의회 제10대" 접두사와 "제N차 회의록" 접미사를 뺀, 세부항목 표의 회의 열에 쓸 짧은 표기.
 * 패턴에 안 맞는 제목(방어적)은 meetingShortTitle과 동일하게 첫 줄 그대로 반환한다.
 */
export function meetingSessionTitle(fullTitle: string): string {
  const firstLine = meetingShortTitle(fullTitle);
  const match = firstLine.match(/^거제시의회\s*제10대\s*(.+?)\s*제\d+차\s*회의록\s*$/);
  return match ? match[1].trim() : firstLine;
}
