import { test, expect, vi } from "vitest";
import { generateObject } from "ai";
import { scoreStatement } from "./score";

vi.mock("ai", () => ({ generateObject: vi.fn() }));

test("scoreStatement returns all 8 axes in 1-5 range with rationale, persistence null with no prior context", async () => {
  (generateObject as any).mockResolvedValue({
    object: {
      creativity: 4,
      feasibility: 3,
      evidenceLegal: 5,
      persistence: null,
      oversight: 2,
      citizenBenefit: 4,
      futureStrategy: 3,
      cityDevelopment: 4,
      topicsToWatch: ["예산 집행 여부 재확인"],
      rationale: "구체적 통계자료를 인용했고, 실현 가능한 예산안을 제시함",
    },
  });

  const result = await scoreStatement("발언 원문...", "요약...", "budget_review", []);
  expect(result.creativity).toBeGreaterThanOrEqual(1);
  expect(result.creativity).toBeLessThanOrEqual(5);
  expect(result.persistence).toBeNull();
  expect(result.rationale.length).toBeGreaterThan(0);
});

test("scoreStatement passes prior context into the prompt when available", async () => {
  (generateObject as any).mockResolvedValue({
    object: {
      creativity: 3,
      feasibility: 4,
      evidenceLegal: 4,
      persistence: 5,
      oversight: 4,
      citizenBenefit: 3,
      futureStrategy: 3,
      cityDevelopment: 3,
      topicsToWatch: [],
      rationale: "이전 회기 발언을 인용하며 이행 여부를 재확인함",
    },
  });

  const result = await scoreStatement("발언 원문...", "요약...", "admin_audit", [
    { meetingTitle: "제263회 임시회", summary: "이전 발언 요약" },
  ]);
  expect(result.persistence).toBe(5);

  const calls = (generateObject as any).mock.calls;
  const call = calls[calls.length - 1][0];
  expect(call.prompt).toContain("이전 회기 참조");
  expect(call.prompt).toContain("이전 발언 요약");
});
