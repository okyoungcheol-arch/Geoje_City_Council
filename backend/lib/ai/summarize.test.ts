import { test, expect, vi } from "vitest";
import { generateObject } from "ai";
import { summarizeStatement } from "./summarize";

vi.mock("ai", () => ({ generateObject: vi.fn() }));

test("summarizeStatement returns summary and tags from Sonnet 5", async () => {
  (generateObject as any).mockResolvedValue({
    object: { summary: "상습 침수 지역의 배수로 정비 예산 확대를 요구함", tags: ["재해예방", "예산증액"] },
  });

  const result = await summarizeStatement("존경하는 의장님... 배수로 정비 예산을...");
  expect(result.summary).toContain("배수로");
  expect(result.tags).toEqual(["재해예방", "예산증액"]);
});
