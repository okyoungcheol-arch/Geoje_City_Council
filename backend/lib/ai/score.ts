import { generateObject } from "ai";
import { z } from "zod";

const ScoreSchema = z.object({
  learningLevel: z.number().int().min(1).max(5).describe("발언에 담긴 사전 학습·근거자료 활용 수준"),
  questionScore: z.number().int().min(1).max(5).describe("질의의 날카로움과 구체성"),
  ideaScore: z.number().int().min(1).max(5).describe("제안 아이디어의 창의성"),
  feasibilityScore: z.number().int().min(1).max(5).describe("제안의 현실적 실행 가능성"),
  geojeImpactScore: z.number().int().min(1).max(5).describe("거제시 발전과 개선에 미치는 잠재적 영향도"),
  rationale: z.string().describe("위 5개 점수를 매긴 핵심 근거를 2-3문장으로 설명"),
});

export interface InsightScores {
  learningLevel: number;
  questionScore: number;
  ideaScore: number;
  feasibilityScore: number;
  geojeImpactScore: number;
  rationale: string;
}

export async function scoreStatement(rawText: string, summary: string): Promise<InsightScores> {
  const { object } = await generateObject({
    model: "anthropic/claude-opus-5",
    schema: ScoreSchema,
    prompt: `당신은 지방의회 의정활동을 평가하는 전문 분석가입니다. 아래 거제시의회 의원 발언을 읽고 5가지 항목을 각각 1~5점으로 채점하세요.

- 학습수준: 발언에 담긴 사전 학습, 데이터·근거자료 활용 수준
- 질의평점: 질의의 날카로움, 구체성, 논리성
- 아이디어점수: 제안한 아이디어의 창의성과 참신함
- 실행가능성: 제안이 예산·제도상 현실적으로 실행 가능한 정도
- 거제영향도: 이 발언이 실현될 경우 거제시 발전과 개선에 미치는 영향의 크기

발언 요약: ${summary}

발언 원문:
${rawText}`,
  });
  return object;
}
