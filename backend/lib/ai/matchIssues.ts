import { generateObject } from "ai";
import { z } from "zod";

export interface OpenTicket {
  id: number;
  description: string;
}

export interface IssueMatchResult {
  newIssueIndex: number;
  matchedTicketId: number | null;
}

export const MatchSchema = z.object({
  matches: z.array(
    z.object({
      newIssueIndex: z.number().int().min(0),
      matchedTicketId: z
        .number()
        .int()
        .nullable()
        .describe("동일 사안이면 그 티켓 id, 아니면 null. 확신이 낮으면 반드시 null(신규로 처리)."),
    })
  ),
});

export async function matchIssues(newIssues: string[], openTickets: OpenTicket[]): Promise<IssueMatchResult[]> {
  const { object } = await generateObject({
    model: "anthropic/claude-opus-5",
    providerOptions: {
      gateway: {
        order: ["anthropic", "claudeaws", "bedrock"],
      },
    },
    schema: MatchSchema,
    prompt: `아래는 한 거제시의회 의원이 이번 회기에 새로 제기한 이슈 목록과, 이 의원이 과거 회기에 제기해 아직 미해결인 이슈 티켓 목록입니다. 새 이슈 각각이 기존 미해결 티켓 중 하나와 같은 사안(같은 시설·같은 예산 항목·같은 정책)을 다시 제기하는 것인지 판단하세요. 표현이 다르더라도 같은 사안이면 매칭하되, 확신이 낮으면 반드시 null(신규 이슈)로 처리하세요. 이 의원이 아닌 다른 의원의 이슈와는 절대 매칭하지 마세요(아래 목록은 이미 이 의원 것만 걸러져 있습니다).

이번 회기 새 이슈:
${newIssues.map((issue, i) => `${i}. ${issue}`).join("\n")}

기존 미해결 티켓:
${openTickets.map((t) => `id=${t.id}: ${t.description}`).join("\n")}`,
  });
  return object.matches;
}
