import { test, expect, vi } from "vitest";
import { getInsightRows } from "./insights";

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => Promise.resolve([
              {
                statementId: 1,
                meetingTitle: "제264회 임시회 제1차 본회의",
                memberName: "홍길동",
                tags: ["재해예방"],
                learningLevel: 4,
                questionScore: 3,
                ideaScore: 5,
                feasibilityScore: 3,
                geojeImpactScore: 4,
                summary: "요약",
                rawText: "원문",
                rationale: "근거",
              },
            ]),
          }),
        }),
      }),
    }),
  },
}));

test("getInsightRows returns joined rows shaped for the API", async () => {
  const rows = await getInsightRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].memberName).toBe("홍길동");
  expect(rows[0].tags).toEqual(["재해예방"]);
});
