import { test, expect, vi } from "vitest";
import { getInsightRows } from "./insights";

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () =>
                Promise.resolve([
                  {
                    statementId: 1,
                    meetingTitle: "제264회 임시회 제1차 본회의",
                    memberName: "홍길동",
                    tags: ["재해예방"],
                    topicsToWatch: ["예산 집행 여부 재확인"],
                    speechType: "budget_review",
                    creativity: null,
                    feasibility: 4,
                    evidenceLegal: 5,
                    persistence: null,
                    persistenceStatus: "pending_future_evaluation",
                    oversight: 3,
                    citizenBenefit: 4,
                    futureStrategy: 3,
                    cityDevelopment: 4,
                    weightedScore: "3.93",
                    summary: "요약",
                    rawText: "원문",
                    rationale: "근거",
                  },
                ]),
            }),
          }),
        }),
      }),
    }),
  },
}));

test("getInsightRows returns joined rows shaped for the API, with weightedScore coerced to number", async () => {
  const rows = await getInsightRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].memberName).toBe("홍길동");
  expect(rows[0].tags).toEqual(["재해예방"]);
  expect(rows[0].weightedScore).toBe(3.93);
  expect(rows[0].creativity).toBeNull();
  expect(rows[0].persistenceStatus).toBe("pending_future_evaluation");
});
