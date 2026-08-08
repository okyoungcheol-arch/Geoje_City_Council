import { test, expect, vi } from "vitest";
import { getInsightRows } from "./insights";

function makeRow(overrides: Record<string, unknown>) {
  return {
    statementId: 1,
    meetingId: 1,
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

// 회의 A(meetingId 1): 정규화 후 3명(홍길동/임수환/김영규) 발언, agendaItems 있음 -> 포함.
// 회의 B(meetingId 2): 정규화 후 2명뿐(임수환 중복 표기) -> 3명 미만으로 제외.
// 회의 C(meetingId 3): 실질 발언 의원 3명 이상이지만 agendaItems가 0건(개회식류) -> 제외.
const fixture = [
  makeRow({ statementId: 1, meetingId: 1, meetingTitle: "회의 A", memberName: "홍길동" }),
  makeRow({ statementId: 2, meetingId: 1, meetingTitle: "회의 A", memberName: "임수환" }),
  makeRow({ statementId: 3, meetingId: 1, meetingTitle: "회의 A", memberName: "김영규" }),
  makeRow({ statementId: 4, meetingId: 2, meetingTitle: "회의 B", memberName: "임수환" }),
  makeRow({ statementId: 5, meetingId: 2, meetingTitle: "회의 B", memberName: "부의장 임수환" }),
  makeRow({ statementId: 6, meetingId: 3, meetingTitle: "회의 C", memberName: "홍길동" }),
  makeRow({ statementId: 7, meetingId: 3, meetingTitle: "회의 C", memberName: "임수환" }),
  makeRow({ statementId: 8, meetingId: 3, meetingTitle: "회의 C", memberName: "김영규" }),
];

// meetingId 1에만 agendaItems가 있음 (회의 C=3은 없음 — 개회식류 시나리오)
const agendaItemMeetingIds = [{ meetingId: 1 }];

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
    selectDistinct: () => ({
      from: () => Promise.resolve(agendaItemMeetingIds),
    }),
  },
}));

test("a meeting with 3+ members and at least one agenda item is included", async () => {
  const rows = await getInsightRows();
  const meetingA = rows.filter((r) => r.meetingTitle === "회의 A");
  expect(meetingA).toHaveLength(3);
});

test("a meeting under the 3-member threshold is excluded regardless of agenda items", async () => {
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 B")).toBe(false);
});

test("a meeting with 3+ members but zero agendaItems rows is excluded (부의된 안건 게이트)", async () => {
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 C")).toBe(false);
});

test("weightedScore is coerced to number and nullable axes stay null", async () => {
  const rows = await getInsightRows();
  const row = rows.find((r) => r.statementId === 1)!;
  expect(row.weightedScore).toBe(3.93);
  expect(row.creativity).toBeNull();
  expect(row.persistenceStatus).toBe("pending_future_evaluation");
});
