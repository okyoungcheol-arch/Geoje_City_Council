import { test, expect, vi, beforeAll } from "vitest";
import { hasQaStructure, extractQaRounds, QaRoundSchema } from "./extractQaRounds";

// Mock ai module before any imports
vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { rounds: [{ roundIndex: 0, answerGrade: "회피", bonusTags: ["쟁점고정"] }] },
  }),
}));

// Tests for hasQaStructure
test("returns true when a staff/executive speaker follows before the next member turn", () => {
  expect(hasQaStructure(["부시장 민기식", "홍길동"])).toBe(true);
});

test("returns false when the very next turn is already another member", () => {
  expect(hasQaStructure(["김미영"])).toBe(false);
});

test("returns false for an empty list (last statement in the meeting)", () => {
  expect(hasQaStructure([])).toBe(false);
});

// Tests for extractQaRounds
test("extractQaRounds returns classified rounds from the mocked model", async () => {
  const rounds = await extractQaRounds("보조금 집행 절차를 준수했습니까?", ["검토하겠습니다."]);
  expect(rounds).toEqual([{ roundIndex: 0, answerGrade: "회피", bonusTags: ["쟁점고정"] }]);
});

// Schema validation tests for QaRoundSchema
test("QaRoundSchema validates a correct QaRound object", () => {
  const validRound = {
    roundIndex: 0,
    answerGrade: "확답",
    bonusTags: ["모순포착", "패턴제시"],
  };
  const result = QaRoundSchema.safeParse(validRound);
  expect(result.success).toBe(true);
});

test("QaRoundSchema rejects a QaRound missing roundIndex", () => {
  const invalidRound = {
    answerGrade: "확답",
    bonusTags: [],
  };
  const result = QaRoundSchema.safeParse(invalidRound);
  expect(result.success).toBe(false);
});

test("QaRoundSchema rejects a QaRound with invalid answerGrade", () => {
  const invalidRound = {
    roundIndex: 0,
    answerGrade: "잘못된값",
    bonusTags: [],
  };
  const result = QaRoundSchema.safeParse(invalidRound);
  expect(result.success).toBe(false);
});

test("QaRoundSchema rejects a QaRound with invalid bonusTag", () => {
  const invalidRound = {
    roundIndex: 0,
    answerGrade: "조건부",
    bonusTags: ["잘못된태그"],
  };
  const result = QaRoundSchema.safeParse(invalidRound);
  expect(result.success).toBe(false);
});

test("QaRoundSchema accepts all valid answerGrade values", () => {
  const grades = ["확답", "조건부", "회피"] as const;
  for (const grade of grades) {
    const result = QaRoundSchema.safeParse({
      roundIndex: 0,
      answerGrade: grade,
      bonusTags: [],
    });
    expect(result.success).toBe(true);
  }
});

test("QaRoundSchema accepts all valid bonusTag values", () => {
  const tags = ["모순포착", "패턴제시", "쟁점고정", "법근거제시"];
  const result = QaRoundSchema.safeParse({
    roundIndex: 0,
    answerGrade: "확답",
    bonusTags: tags,
  });
  expect(result.success).toBe(true);
});
