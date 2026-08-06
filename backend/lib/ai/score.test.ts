import { test, expect, vi } from "vitest";
import { generateObject } from "ai";
import { scoreStatement } from "./score";

vi.mock("ai", () => ({ generateObject: vi.fn() }));

test("scoreStatement returns all 5 axes in 1-5 range with rationale", async () => {
  (generateObject as any).mockResolvedValue({
    object: {
      learningLevel: 4,
      questionScore: 3,
      ideaScore: 5,
      feasibilityScore: 3,
      geojeImpactScore: 4,
      rationale: "구체적 통계자료를 인용했고, 실현 가능한 예산안을 제시함",
    },
  });

  const result = await scoreStatement("발언 원문...", "요약...");
  expect(result.learningLevel).toBeGreaterThanOrEqual(1);
  expect(result.learningLevel).toBeLessThanOrEqual(5);
  expect(result.rationale.length).toBeGreaterThan(0);
});
