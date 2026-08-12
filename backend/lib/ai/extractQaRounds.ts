import { generateObject } from "ai";
import { z } from "zod";
import { isNonMemberSpeaker } from "@/lib/members/isNonMemberSpeaker";

/**
 * "다음 의원 턴이 나오기 전까지" 순서로 넘어온 화자 이름 목록에서, 그 중 하나라도
 * 집행부/사무국(비의원) 화자면 질의응답 구조가 있다고 판정한다. 호출부(processStatement.ts)가
 * 이미 "다음 의원 턴 전까지"로 잘라서 넘기므로, 여기서는 순서를 다시 따지지 않는다.
 */
export function hasQaStructure(followingSpeakerNames: string[]): boolean {
  return followingSpeakerNames.some((name) => isNonMemberSpeaker(name));
}

export const QaRoundSchema = z.object({
  roundIndex: z.number().int().min(0),
  answerGrade: z
    .enum(["확답", "조건부", "회피"])
    .describe(
      "확답: 시기/주체/방법 중 2개 이상 구체적으로 명시. 조건부: 조건부 약속. " +
        "회피: '검토하겠습니다'·'노력하겠습니다'·'살펴보겠습니다' 류로 구체성 없음"
    ),
  bonusTags: z
    .array(z.enum(["모순포착", "패턴제시", "쟁점고정", "법근거제시"]))
    .describe(
      "모순포착: 답변이 이전 진술과 모순됨을 의원이 지적. 패턴제시: 단발이 아닌 반복 구조로 제시. " +
        "쟁점고정: 상대의 화제 전환을 차단하고 원 쟁점으로 복귀. 법근거제시: 추궁 중 법령 조문 인용"
    ),
});

export interface QaRound {
  roundIndex: number;
  answerGrade: "확답" | "조건부" | "회피";
  bonusTags: string[];
}

export async function extractQaRounds(questionText: string, answerTexts: string[]): Promise<QaRound[]> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: z.object({ rounds: z.array(QaRoundSchema) }),
    prompt: `다음은 거제시의회 의원의 질의와 집행부 답변입니다. 답변마다 등급(확답/조건부/회피)을 매기고, 해당되는 가산 태그가 있으면 표시하세요. 회의록에 명시되지 않은 내용은 추측하지 마세요.

의원 질의:
${questionText}

집행부 답변(순서대로):
${answerTexts.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
  });
  return object.rounds;
}
