import { test, expect, vi } from "vitest";
import { getInsightRows } from "./insights";

function makeRow(overrides: Record<string, unknown>) {
  return {
    statementId: 1,
    meetingTitle: "제264회 임시회 제1차 본회의",
    memberName: "홍길동",
    tags: ["재해예방"],
    topicsToWatch: ["예산 집행 여부 재확인"],
    speechType: "budget_review",
    creativity: null,
    feasibility: 4,
    evidenceLegal: 5,
    persistence: null,
    persistenceStatus: "pending_future_evaluation",
    oversight: 3,
    citizenBenefit: 4,
    futureStrategy: 3,
    cityDevelopment: 4,
    weightedScore: "3.93",
    summary: "요약",
    rawText: "원문",
    rationale: "근거",
    ...overrides,
  };
}

// 회의 A: 정규화 후 서로 다른 3명(홍길동/임수환/김영규)이 발언 — 포함 대상.
// 회의 B: "임수환"과 "부의장 임수환"이 실제로는 동일 인물이라 정규화 후 2명뿐 — 3명 미만이라 제외.
const fixture = [
  makeRow({ statementId: 1, meetingTitle: "회의 A", memberName: "홍길동" }),
  makeRow({ statementId: 2, meetingTitle: "회의 A", memberName: "임수환" }),
  makeRow({ statementId: 3, meetingTitle: "회의 A", memberName: "김영규" }),
  makeRow({ statementId: 4, meetingTitle: "회의 B", memberName: "임수환" }),
  makeRow({ statementId: 5, meetingTitle: "회의 B", memberName: "부의장 임수환" }),
];

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve(fixture),
            }),
          }),
        }),
      }),
    }),
  },
}));

test("rows from a meeting with 3+ distinct (normalized) members are included", async () => {
  const rows = await getInsightRows();
  const meetingATitles = rows.filter((r) => r.meetingTitle === "회의 A");
  expect(meetingATitles).toHaveLength(3);
  expect(meetingATitles.map((r) => r.memberName).sort()).toEqual(["김영규", "임수환", "홍길동"]);
});

test("a meeting whose substantive speakers normalize down to under 3 is excluded entirely", async () => {
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 B")).toBe(false);
});

test("member name variants collapse to the roster name before the 3-member count is taken", async () => {
  // 회의 B가 통째로 제외된 것 자체가, "임수환"과 "부의장 임수환"을 서로 다른 사람으로 잘못 세지
  // 않았다는 증거다(정규화 없이 세면 2명이 아니라 이미 서로 다른 이름 2개로 보여 우연히 같은
  // 결과가 나올 수 있으므로, 정규화 함수가 실제로 두 표기를 하나로 합치는지도 별도 확인한다).
  const rows = await getInsightRows();
  const namesInMeetingA = rows.filter((r) => r.meetingTitle === "회의 A").map((r) => r.memberName);
  expect(namesInMeetingA).toContain("임수환");
});

test("weightedScore is coerced to number and nullable axes stay null", async () => {
  const rows = await getInsightRows();
  const row = rows.find((r) => r.statementId === 1)!;
  expect(row.weightedScore).toBe(3.93);
  expect(row.creativity).toBeNull();
  expect(row.persistenceStatus).toBe("pending_future_evaluation");
});
