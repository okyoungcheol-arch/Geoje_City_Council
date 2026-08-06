import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { InsightRow } from "@/lib/queries/insights";

const fixture: InsightRow[] = [
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
    summary: "요약1",
    rawText: "원문1",
    rationale: "근거1",
  },
  {
    statementId: 2,
    meetingTitle: "제265회 정례회 제2차 본회의",
    memberName: "김철수",
    tags: ["교육"],
    learningLevel: 2,
    questionScore: 4,
    ideaScore: 2,
    feasibilityScore: 5,
    geojeImpactScore: 2,
    summary: "요약2",
    rawText: "원문2",
    rationale: "근거2",
  },
  {
    statementId: 3,
    meetingTitle: "제264회 임시회 제1차 본회의",
    memberName: "홍길동",
    tags: ["복지"],
    learningLevel: 5,
    questionScore: 5,
    ideaScore: 4,
    feasibilityScore: 4,
    geojeImpactScore: 5,
    summary: "요약3",
    rawText: "원문3",
    rationale: "근거3",
  },
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

test("minGeojeImpact filter returns only rows at or above the threshold", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/insights?minGeojeImpact=4"));
  const body = await res.json();
  expect(body).toHaveLength(2);
  expect(body.every((r: InsightRow) => r.geojeImpactScore >= 4)).toBe(true);
});

test("combining member and minGeojeImpact narrows to the intersection", async () => {
  const res = await GET(
    new NextRequest(
      "http://localhost:3000/api/insights?member=" + encodeURIComponent("홍길동") + "&minGeojeImpact=5"
    )
  );
  const body = await res.json();
  expect(body).toHaveLength(1);
  expect(body[0].statementId).toBe(3);
});
