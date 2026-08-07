import type { SpeechType } from "@/lib/ai/summarize";

// CLAUDE.md §4 발언 유형별 가중치 (① 창의성 ~ ⑧ 거제발전). `null` = 해당 발언유형에서
// 가중치 미적용("―(제외)"), 즉 원점수는 표시하되 가중평균 계산에서 제외한다.
export const AXES = [
  "creativity",
  "feasibility",
  "evidenceLegal",
  "persistence",
  "oversight",
  "citizenBenefit",
  "futureStrategy",
  "cityDevelopment",
] as const;
export type Axis = (typeof AXES)[number];

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
    creativity: null, // ―(제외): 예산 심의는 창의성 축이 구조적으로 낮게 나옴 (CLAUDE.md §3①)
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

export type AxisScores = Record<Axis, number | null>;

/**
 * CLAUDE.md §4 산출식: 가중평균 = Σ(축 점수 × 적용 가중치) / Σ(적용 가중치).
 * "―(제외)" 축과 지속성이 N/A(persistence === null)인 축은 분자·분모 모두에서 제외한다.
 * Returns null only if every axis ended up excluded (should not happen in practice).
 */
export function computeWeightedScore(scores: AxisScores, speechType: SpeechType): number | null {
  const weights = AXIS_WEIGHTS[speechType];
  let weightedSum = 0;
  let appliedWeight = 0;

  for (const axis of AXES) {
    const weight = weights[axis];
    const value = scores[axis];
    if (weight === null || value === null) continue;
    weightedSum += value * weight;
    appliedWeight += weight;
  }

  if (appliedWeight === 0) return null;
  return Math.round((weightedSum / appliedWeight) * 100) / 100;
}
