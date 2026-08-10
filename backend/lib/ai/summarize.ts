import { generateObject } from "ai";
import { z } from "zod";

// CLAUDE.md §4's four 발언유형 categories, used to pick the axis weight column at
// scoring time. "five_min" also covers general/plenary remarks with no closer match
// (opening addresses, etc.) — CLAUDE.md's weight table treats that column as the
// default case for statements that aren't tied to a specific committee-review agenda.
export const SPEECH_TYPES = ["five_min", "budget_review", "admin_audit", "ordinance_proposal"] as const;
export type SpeechType = (typeof SPEECH_TYPES)[number];

const CitationSchema = z.object({
  type: z.enum(["L", "S", "P", "F"]).describe(
    "L=법률명+조항 특정, S=수치+기준연도/출처 명시, P=지자체명+사업명 특정, F=방문·사진·직접관찰 언급"
  ),
  text: z.string().describe("인용 부분의 원문 발췌"),
});

const ProposalSchema = z.object({
  budget: z.boolean().describe("예산 규모·조달방안·절감 여부가 구체적으로 언급되었는가"),
  timeline: z.boolean().describe("착수시점·연차 등 시기가 구체적으로 언급되었는가"),
  subject: z.boolean().describe("담당 부서·기관이 특정되었는가"),
  method: z.boolean().describe("실행 단계·방법이 구체적으로 명시되었는가"),
});

const SelfRaisedIssueSchema = z.object({
  description: z.string().describe("의원이 스스로 제기한, 향후 추적 가능한 구체적 이슈 설명"),
});

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
  citations: z.array(CitationSchema).describe("발언 중 법령조문·공식통계·검증가능출처·현장확인 인용 목록"),
  proposals: z.array(ProposalSchema).describe("발언에 담긴 각 제안의 4요소 충족 여부 (제안이 없으면 빈 배열)"),
  selfRaisedIssues: z.array(SelfRaisedIssueSchema).describe("의원이 스스로 제기한 향후 추적 가능한 이슈 목록"),
});

export interface Citation { type: "L" | "S" | "P" | "F"; text: string }
export interface Proposal { budget: boolean; timeline: boolean; subject: boolean; method: boolean }
export interface SelfRaisedIssue { description: string }

export interface SummaryResult {
  summary: string;
  tags: string[];
  isProcedural: boolean;
  speechType: SpeechType;
  citations: Citation[];
  proposals: Proposal[];
  selfRaisedIssues: SelfRaisedIssue[];
}

export async function summarizeStatement(rawText: string, agendaTitle?: string | null): Promise<SummaryResult> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: SummarySchema,
    prompt: `다음은 거제시의회 의원의 발언 원문입니다. 핵심 내용을 요약하고, 발언의 주제를 나타내는 짧은 태그를 2~4개 생성하세요. 또한 이 발언이 순수 의사진행 절차 발언인지 판별하고, 발언 유형을 분류하세요. 추가로 발언 중 법령조문·공식통계·검증가능출처·현장확인 인용, 제안의 4요소(예산·시기·주체·방법) 충족 여부, 의원이 스스로 제기한 향후 추적 가능한 이슈를 회의록에 명시된 내용만 근거로 추출하세요.
${agendaTitle ? `\n안건명(참고용): ${agendaTitle}\n` : ""}
발언 원문:
${rawText}`,
  });
  return object;
}
