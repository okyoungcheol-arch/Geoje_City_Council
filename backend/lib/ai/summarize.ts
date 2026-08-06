import { generateObject } from "ai";
import { z } from "zod";

const SummarySchema = z.object({
  summary: z.string().describe("발언의 핵심 내용을 2-3문장으로 요약"),
  tags: z.array(z.string()).min(2).max(4).describe("발언의 핵심 주제를 나타내는 짧은 한국어 태그"),
});

export async function summarizeStatement(rawText: string): Promise<{ summary: string; tags: string[] }> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: SummarySchema,
    prompt: `다음은 거제시의회 의원의 발언 원문입니다. 핵심 내용을 요약하고, 발언의 주제를 나타내는 짧은 태그를 2~4개 생성하세요.\n\n발언 원문:\n${rawText}`,
  });
  return object;
}
