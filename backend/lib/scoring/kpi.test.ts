import { test, expect } from "vitest";
import {
  computeEvidenceDensity,
  computeSolutionSpecificity,
  computeInterrogationDepth,
  computeCommitmentRate,
  computeIssuePersistenceGrade,
} from "./kpi";

test("computeEvidenceDensity: 4 citations over 100s = 4.0 density, grade A", () => {
  const citations = [
    { type: "L" as const, text: "a" },
    { type: "S" as const, text: "b" },
    { type: "P" as const, text: "c" },
    { type: "F" as const, text: "d" },
  ];
  expect(computeEvidenceDensity(citations, 100)).toEqual({ value: 4.0, grade: "A" });
});

test("computeEvidenceDensity: grade boundaries B/C/D", () => {
  const oneCitation = [{ type: "L" as const, text: "a" }];
  expect(computeEvidenceDensity(oneCitation, 40).grade).toBe("B"); // 2.5
  expect(computeEvidenceDensity(oneCitation, 80).grade).toBe("C"); // 1.25
  expect(computeEvidenceDensity(oneCitation, 200).grade).toBe("D"); // 0.5
});

test("computeEvidenceDensity: null speech duration returns null (not approximated)", () => {
  expect(computeEvidenceDensity([{ type: "L", text: "a" }], null)).toEqual({ value: null, grade: null });
});

test("computeSolutionSpecificity: averages element counts across proposals", () => {
  const proposals = [
    { budget: true, timeline: true, subject: true, method: false }, // 3
    { budget: true, timeline: false, subject: false, method: false }, // 1
  ];
  expect(computeSolutionSpecificity(proposals)).toBe(2.0);
});

test("computeSolutionSpecificity: no proposals returns null (N/A, not 0)", () => {
  expect(computeSolutionSpecificity([])).toBeNull();
});

test("computeInterrogationDepth: 2 rounds, one bonus tag", () => {
  const rounds = [
    { roundIndex: 0, answerGrade: "회피" as const, bonusTags: ["회피차단"] },
    { roundIndex: 1, answerGrade: "확답" as const, bonusTags: [] },
  ];
  const result = computeInterrogationDepth(rounds);
  expect(result?.value).toBe(2.5); // 2 rounds + 0.5 bonus
  expect(result?.reQuestionRate).toBe(1); // 2 rounds / 1 question(round 0's re-question is round 1)
});

test("computeInterrogationDepth: no rounds (no Q&A structure) returns null", () => {
  expect(computeInterrogationDepth([])).toBeNull();
});

test("computeCommitmentRate: mixed grades average to 0.5", () => {
  const rounds = [
    { roundIndex: 0, answerGrade: "확답" as const, bonusTags: [] },
    { roundIndex: 1, answerGrade: "회피" as const, bonusTags: [] },
  ];
  expect(computeCommitmentRate(rounds)).toBe(0.5);
});

test("computeCommitmentRate: no rounds returns null", () => {
  expect(computeCommitmentRate([])).toBeNull();
});

test("computeIssuePersistenceGrade: boundary values", () => {
  expect(computeIssuePersistenceGrade(0.6)).toBe("A");
  expect(computeIssuePersistenceGrade(0.4)).toBe("B");
  expect(computeIssuePersistenceGrade(0.2)).toBe("C");
  expect(computeIssuePersistenceGrade(0.19)).toBe("D");
});
