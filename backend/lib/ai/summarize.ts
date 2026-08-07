import { generateObject } from "ai";
import { z } from "zod";

// CLAUDE.md §4's four 발언유형 categories, used to pick the axis weight column at
// scoring time. "five_min" also covers general/plenary remarks with no closer match
// (opening addresses, etc.) — CLAUDE.md's weight table treats that column as the
// default case for statements that aren't tied to a specific committee-review agenda.
export const SPEECH_TYPES = ["five_min", "budget_review", "admin_audit", "ordinance_proposal"] as const;
export type SpeechType = (typeof SPEECH_TYPES)[number];

const SummarySchema = z.object({
  summary: z.string().describe("발언의 핵심 내용을 2-3문장으로 요약"),
  tags: z.array(z.string()).min(2).max(4).describe("발언의 핵심 주제를 나타내는 짧은 한국어 태그"),
  isProcedural: z
    .boolean()
    .describe(
      "의장·부의장의 개회/폐회 선언, 안건 상정·가결 공지, 회기 결정, 휴회·산회 선포, 국민의례·묵념 안내, " +
        "위원회 구성 발표 등 순수 의사진행 절차 발언이면 true. 정책 의견, 질의, 제안, 실질적 내용이 조금이라도 " +
        "있으면 false (예: 개회사에 정책 방향이나 당부가 담겨 있으면 false)"
    ),
  speechType: z
    .enum(SPEECH_TYPES)
    .describe(
      "발언 유형 분류. budget_review: 예산·결산·추경·기금운용계획 심의 관련 발언. " +
        "admin_audit: 행정사무감사 관련 발언. ordinance_proposal: 조례 제정·개정안 발안·설명 관련 발언. " +
        "five_min: 그 외 일반 본회의 발언(개회사, 시정질문 등 위 세 범주에 해당하지 않는 모든 발언)"
    ),
});

export interface SummaryResult {
  summary: string;
  tags: string[];
  isProcedural: boolean;
  speechType: SpeechType;
}

export async function summarizeStatement(rawText: string, agendaTitle?: string | null): Promise<SummaryResult> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: SummarySchema,
    prompt: `다음은 거제시의회 의원의 발언 원문입니다. 핵심 내용을 요약하고, 발언의 주제를 나타내는 짧은 태그를 2~4개 생성하세요. 또한 이 발언이 순수 의사진행 절차 발언인지 판별하고, 발언 유형을 분류하세요.
${agendaTitle ? `\n안건명(참고용): ${agendaTitle}\n` : ""}
발언 원문:
${rawText}`,
  });
  return object;
}
