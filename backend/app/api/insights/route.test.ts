import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { InsightRow } from "@/lib/queries/insights";

function makeRow(overrides: Partial<InsightRow>): InsightRow {
  return {
    statementId: 1,
    meetingTitle: "제264회 임시회 제1차 본회의",
    memberName: "홍길동",
    tags: ["재해예방"],
    topicsToWatch: [],
    speechType: "five_min",
    creativity: 4,
    feasibility: 3,
    evidenceLegal: 5,
    persistence: null,
    persistenceStatus: "pending_future_evaluation",
    oversight: 2,
    citizenBenefit: 4,
    futureStrategy: 3,
    cityDevelopment: 4,
    weightedScore: 3.5,
    summary: "요약",
    rawText: "원문",
    rationale: "근거",
    ...overrides,
  };
}

const fixture: InsightRow[] = [
  makeRow({ statementId: 1, meetingTitle: "제264회 임시회 제1차 본회의", memberName: "홍길동", tags: ["재해예방"], weightedScore: 3.9 }),
  makeRow({ statementId: 2, meetingTitle: "제265회 정례회 제2차 본회의", memberName: "김철수", tags: ["교육"], weightedScore: 2.2 }),
  makeRow({ statementId: 3, meetingTitle: "제264회 임시회 제1차 본회의", memberName: "홍길동", tags: ["복지"], weightedScore: 4.4 }),
];

vi.mock("@/lib/queries/insights", () => ({
  getInsightRows: vi.fn(() => Promise.resolve(fixture)),
}));

const { GET } = await import("./route");

test("no filters returns all rows", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/insights"));
  const body = await res.json();
  expect(body).toHaveLength(3);
});

test("member filter returns only matching member's rows", async () => {
  const res = await GET(
    new NextRequest("http://localhost:3000/api/insights?member=" + encodeURIComponent("홍길동"))
  );
  const body = await res.json();
  expect(body).toHaveLength(2);
  expect(body.every((r: InsightRow) => r.memberName === "홍길동")).toBe(true);
});

test("meeting filter returns only matching meeting's rows", async () => {
  const res = await GET(
    new NextRequest(
      "http://localhost:3000/api/insights?meeting=" + encodeURIComponent("제265회 정례회 제2차 본회의")
    )
  );
  const body = await res.json();
  expect(body).toHaveLength(1);
  expect(body[0].statementId).toBe(2);
});

test("minWeightedScore filter returns only rows at or above the threshold", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/insights?minWeightedScore=3.5"));
  const body = await res.json();
  expect(body).toHaveLength(2);
  expect(body.every((r: InsightRow) => r.weightedScore >= 3.5)).toBe(true);
});

test("combining member and minWeightedScore narrows to the intersection", async () => {
  const res = await GET(
    new NextRequest(
      "http://localhost:3000/api/insights?member=" + encodeURIComponent("홍길동") + "&minWeightedScore=4"
    )
  );
  const body = await res.json();
  expect(body).toHaveLength(1);
  expect(body[0].statementId).toBe(3);
});
