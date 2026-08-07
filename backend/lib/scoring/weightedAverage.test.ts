import { test, expect } from "vitest";
import { computeWeightedScore } from "./weightedAverage";

// Fixtures from root CLAUDE.md §7.2 (제264회 예산결산특별위원회 worked example).
// budget_review weights: creativity excluded, persistence excluded (all N/A in that
// example), feasibility 1.0, evidenceLegal 2.0, oversight 2.0, citizenBenefit 1.0,
// futureStrategy 1.0, cityDevelopment 0.5 — applied weight sum 7.5.

test("최민혁 row matches CLAUDE.md §7.2 (4.20)", () => {
  const score = computeWeightedScore(
    {
      creativity: 2,
      feasibility: 5,
      evidenceLegal: 5,
      persistence: null,
      oversight: 5,
      citizenBenefit: 3,
      futureStrategy: 2,
      cityDevelopment: 3,
    },
    "budget_review"
  );
  expect(score).toBe(4.2);
});

test("정예찬 row matches CLAUDE.md §7.2 (2.80)", () => {
  const score = computeWeightedScore(
    {
      creativity: 5,
      feasibility: 4,
      evidenceLegal: 3,
      persistence: null,
      oversight: 1,
      citizenBenefit: 4,
      futureStrategy: 3,
      cityDevelopment: 4,
    },
    "budget_review"
  );
  expect(score).toBe(2.8);
});

test("excludes only the ―(제외) axis when persistence is actually scored", () => {
  const score = computeWeightedScore(
    {
      creativity: 3,
      feasibility: 3,
      evidenceLegal: 3,
      persistence: 3,
      oversight: 3,
      citizenBenefit: 3,
      futureStrategy: 3,
      cityDevelopment: 3,
    },
    "budget_review"
  );
  // weights: feasibility 1 + evidenceLegal 2 + persistence 2 + oversight 2 +
  // citizenBenefit 1 + futureStrategy 1 + cityDevelopment 0.5 = 9.5, all scores 3 → 3.0
  expect(score).toBe(3.0);
});
