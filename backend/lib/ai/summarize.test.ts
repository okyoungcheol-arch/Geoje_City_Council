import { test, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      summary: "요약",
      tags: ["태그1", "태그2"],
      isProcedural: false,
      speechType: "budget_review",
      citations: [{ type: "L", text: "지방재정법 제17조 제2항" }],
      proposals: [{ budget: true, timeline: false, subject: true, method: true }],
      selfRaisedIssues: [{ description: "보조금 집행 절차 준수 여부 확인 필요" }],
    },
  }),
}));

import { summarizeStatement } from "./summarize";

test("returns citations, proposals, selfRaisedIssues alongside existing fields", async () => {
  const result = await summarizeStatement("발언 원문", "안건명");

  expect(result.citations).toEqual([{ type: "L", text: "지방재정법 제17조 제2항" }]);
  expect(result.proposals).toEqual([{ budget: true, timeline: false, subject: true, method: true }]);
  expect(result.selfRaisedIssues).toEqual([{ description: "보조금 집행 절차 준수 여부 확인 필요" }]);
});
