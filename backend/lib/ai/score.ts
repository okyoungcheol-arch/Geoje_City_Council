import { generateObject } from "ai";
import { z } from "zod";
import type { SpeechType } from "@/lib/ai/summarize";

export interface PriorStatementContext {
  meetingTitle: string;
  summary: string;
}

const ScoreSchema = z.object({
  creativity: z.number().int().min(1).max(5).describe("① 정책 창의성 — 기존에 없는 관점·연결·해법인가"),
  feasibility: z.number().int().min(1).max(5).describe("② 실현가능성 — 예산·소관·절차·기간상 실제 집행 가능한가"),
  evidenceLegal: z.number().int().min(1).max(5).describe("③ 근거·법적 타당성 — 법령·통계·선례 인용의 정확성"),
  persistence: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .describe(
      "④ 지속성 — 이전 회기 발언 인용이 주어진 경우에만 채점. 이전 회기 참조 컨텍스트가 전혀 없다면 " +
        "반드시 null (모델이 임의로 점수를 매기지 않는다)"
    ),
  oversight: z.number().int().min(1).max(5).describe("⑤ 견제력 — 절차 위반·모순 추궁 등 감시 기능 수행 정도"),
  citizenBenefit: z.number().int().min(1).max(5).describe("⑥ 시민체감 — 시민이 체감할 편익의 즉시성·규모"),
  futureStrategy: z.number().int().min(1).max(5).describe("⑦ 미래전략 — 중장기 시계·구조 변화 대응·지속가능성 설계"),
  cityDevelopment: z.number().int().min(1).max(5).describe("⑧ 거제발전 — 지역구를 넘어선 거제시 전체 파급력"),
  topicsToWatch: z
    .array(z.string())
    .max(3)
    .describe("이 발언에서 향후 이행 여부를 추적해야 할 구체적 사안 (표1의 '향후 감시할 주제' 열, 0~3개)"),
  rationale: z.string().describe("위 8개 항목을 매긴 핵심 근거를 3-4문장으로 설명"),
});

export interface InsightScores {
  creativity: number;
  feasibility: number;
  evidenceLegal: number;
  persistence: number | null;
  oversight: number;
  citizenBenefit: number;
  futureStrategy: number;
  cityDevelopment: number;
  topicsToWatch: string[];
  rationale: string;
}

const RUBRIC = `- 창의성: 기존에 없던 관점·연결·해법을 제시하는가 (지역 고유 자원 재해석일수록 높음)
- 실현가능성: 예산·소관·절차·기간을 고려할 때 실제로 집행 가능한가
- 근거·법적 타당성: 법령을 조문 단위로 정확히 인용하는가, 통계·선례가 검증 가능한가 (허구 인용은 최대 2점)
- 지속성: 동일 사안에 대한 이전 회기 문제 제기를 이번 발언에서도 추적·재확인하는가 (아래 [이전 회기 참조]가 없으면 null)
- 견제력: 절차 위반 지적, 법적 근거 제시, 반복 패턴 지적, 답변 모순 추궁 등 감시 기능을 수행하는가 (정책 제안 목적 발언은 1~2점이 정상)
- 시민체감: 시민이 즉시·직접 체감할 편익인가, 규모가 데이터로 뒷받침되는가
- 미래전략: 단기 문제 해결을 넘어 3년 이상의 시계로 구조 변화(인구·산업·기후·교통 등)에 대비하는가
- 거제발전: 특정 지역구를 넘어 거제시 전체 경제·인구 구조에 기여하는가`;

export async function scoreStatement(
  rawText: string,
  summary: string,
  speechType: SpeechType,
  priorContext: PriorStatementContext[] = []
): Promise<InsightScores> {
  const priorContextBlock =
    priorContext.length > 0
      ? `\n[이전 회기 참조 — 동일 의원의 과거 발언 요약, 지속성 판단에만 사용]\n${priorContext
          .map((p, i) => `${i + 1}. (${p.meetingTitle}) ${p.summary}`)
          .join("\n")}\n`
      : "\n[이전 회기 참조 없음 — 이 의원의 첫 처리 발언이므로 지속성은 반드시 null로 채점]\n";

  const { object } = await generateObject({
    model: "anthropic/claude-opus-5",
    // Google Vertex AI route returns 429 "No access to this model at this time" for
    // claude-opus-5 on this account (Sonnet 5 via Vertex works fine — account/provider-
    // specific quota issue, not a general outage). Force routing through the other
    // Gateway-listed providers instead, still 100% via Vercel AI Gateway.
    providerOptions: {
      gateway: {
        order: ["anthropic", "claudeaws", "bedrock"],
      },
    },
    schema: ScoreSchema,
    prompt: `당신은 지방의회 의정활동을 평가하는 전문 분석가입니다. 아래 거제시의회 의원 발언을 읽고 8가지 항목을 채점하세요. 이 발언의 유형은 "${speechType}"입니다.

${RUBRIC}
${priorContextBlock}
발언 요약: ${summary}

발언 원문:
${rawText}`,
  });
  return object;
}
