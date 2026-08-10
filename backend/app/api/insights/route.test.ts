import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { InsightRow } from "@/lib/queries/insights";

function makeRow(overrides: Partial<InsightRow>): InsightRow {
  return {
    statementId: 1,
    meetingId: 1,
    meetingTitle: "제264회 임시회 제1차 본회의",
    memberName: "홍길동",
    tags: ["재해예방"],
    topicsToWatch: [],
    speechType: "질의·답변형",
    hasQaStructure: true,
    citations: [],
    kpiEvidenceDensity: 4,
    kpiEvidenceDensityGrade: "A",
    proposals: [],
    kpiSolutionSpecificity: 3,
    qaRounds: [],
    kpiInterrogationDepth: 5,
    kpiReQuestionRate: 0.8,
    kpiCommitmentRate: 0.6,
    selfRaisedIssues: [],
    summary: "요약",
    rawText: "원문",
    rationale: "근거",
    ...overrides,
  };
}

const fixture: InsightRow[] = [
  makeRow({ statementId: 1, meetingTitle: "제264회 임시회 제1차 본회의", memberName: "홍길동", tags: ["재해예방"], kpiEvidenceDensity: 4, kpiCommitmentRate: 0.8 }),
  makeRow({ statementId: 2, meetingTitle: "제265회 정례회 제2차 본회의", memberName: "김철수", tags: ["교육"], kpiEvidenceDensity: 2, kpiCommitmentRate: 0.3 }),
  makeRow({ statementId: 3, meetingTitle: "제264회 임시회 제1차 본회의", memberName: "홍길동", tags: ["복지"], kpiEvidenceDensity: 5, kpiCommitmentRate: 0.9 }),
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

test("minKpi filter on evidenceDensity returns only rows at or above the threshold", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/insights?minKpi=evidenceDensity&minValue=3"));
  const body = await res.json();
  expect(body).toHaveLength(2);
  expect(body.every((r: InsightRow) => r.kpiEvidenceDensity !== null && r.kpiEvidenceDensity >= 3)).toBe(true);
});

test("minKpi filter on commitmentRate returns only rows at or above the threshold", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/insights?minKpi=commitmentRate&minValue=0.6"));
  const body = await res.json();
  expect(body).toHaveLength(2);
  expect(body.every((r: InsightRow) => r.kpiCommitmentRate !== null && r.kpiCommitmentRate >= 0.6)).toBe(true);
});

test("combining member and minKpi narrows to the intersection", async () => {
  const res = await GET(
    new NextRequest(
      "http://localhost:3000/api/insights?member=" + encodeURIComponent("홍길동") + "&minKpi=evidenceDensity&minValue=4"
    )
  );
  const body = await res.json();
  expect(body).toHaveLength(2);
  expect(body.every((r: InsightRow) => r.memberName === "홍길동" && r.kpiEvidenceDensity !== null && r.kpiEvidenceDensity >= 4)).toBe(true);
});

test("response allows cross-origin requests so the web build can fetch it", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/insights"));
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
});
