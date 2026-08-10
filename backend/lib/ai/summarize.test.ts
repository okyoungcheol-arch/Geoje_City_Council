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

import { summarizeStatement, SummarySchema } from "./summarize";

test("returns citations, proposals, selfRaisedIssues alongside existing fields (mocked generateObject)", async () => {
  const result = await summarizeStatement("발언 원문", "안건명");

  // Restore assertions on existing fields
  expect(result.summary).toBe("요약");
  expect(result.tags).toEqual(["태그1", "태그2"]);
  expect(result.isProcedural).toBe(false);
  expect(result.speechType).toBe("budget_review");

  // Assertions on new fields
  expect(result.citations).toEqual([{ type: "L", text: "지방재정법 제17조 제2항" }]);
  expect(result.proposals).toEqual([{ budget: true, timeline: false, subject: true, method: true }]);
  expect(result.selfRaisedIssues).toEqual([{ description: "보조금 집행 절차 준수 여부 확인 필요" }]);
});

test("SummarySchema validates citations, proposals, selfRaisedIssues as required fields", () => {
  // Valid object with all new fields should parse successfully
  const validObject = {
    summary: "발언 요약",
    tags: ["태그1", "태그2"],
    isProcedural: false,
    speechType: "budget_review",
    citations: [{ type: "L", text: "법령" }],
    proposals: [{ budget: true, timeline: true, subject: true, method: true }],
    selfRaisedIssues: [{ description: "이슈 설명" }],
  };

  const validResult = SummarySchema.safeParse(validObject);
  expect(validResult.success).toBe(true);

  // Object missing citations should fail
  const missingCitations = {
    summary: "발언 요약",
    tags: ["태그1", "태그2"],
    isProcedural: false,
    speechType: "budget_review",
    proposals: [{ budget: true, timeline: true, subject: true, method: true }],
    selfRaisedIssues: [{ description: "이슈 설명" }],
  };

  const missingCitationsResult = SummarySchema.safeParse(missingCitations);
  expect(missingCitationsResult.success).toBe(false);

  // Object missing proposals should fail
  const missingProposals = {
    summary: "발언 요약",
    tags: ["태그1", "태그2"],
    isProcedural: false,
    speechType: "budget_review",
    citations: [{ type: "L", text: "법령" }],
    selfRaisedIssues: [{ description: "이슈 설명" }],
  };

  const missingProposalsResult = SummarySchema.safeParse(missingProposals);
  expect(missingProposalsResult.success).toBe(false);

  // Object missing selfRaisedIssues should fail
  const missingSelfRaisedIssues = {
    summary: "발언 요약",
    tags: ["태그1", "태그2"],
    isProcedural: false,
    speechType: "budget_review",
    citations: [{ type: "L", text: "법령" }],
    proposals: [{ budget: true, timeline: true, subject: true, method: true }],
  };

  const missingSelfRaisedIssuesResult = SummarySchema.safeParse(missingSelfRaisedIssues);
  expect(missingSelfRaisedIssuesResult.success).toBe(false);
});
