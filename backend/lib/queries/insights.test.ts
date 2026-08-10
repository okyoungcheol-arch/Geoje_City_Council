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
    hasQaStructure: false,
    citations: [],
    kpiEvidenceDensity: "3.5",
    kpiEvidenceDensityGrade: "B",
    proposals: [],
    kpiSolutionSpecificity: null,
    qaRounds: [],
    kpiInterrogationDepth: null,
    kpiReQuestionRate: null,
    kpiCommitmentRate: null,
    selfRaisedIssues: [],
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

// meetingId 1, 2에는 agendaItems가 있음. meetingId 2(회의 B)도 안건은 있지만 3명 미만이라
// 여전히 제외돼야 하므로, 두 게이트가 서로 독립적으로 동작함을 증명한다.
// meetingId 3(회의 C)은 agendaItems가 0건(개회식류 시나리오).
const agendaItemMeetingIds = [{ meetingId: 1 }, { meetingId: 2 }];

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
  // 정규화된 이름이 실제로 출력에 반영되는지도 확인한다 — 카운트만으로는
  // normalizeMemberName이 제대로 연결돼 있는지 증명하지 못한다.
  expect(meetingA.map((r) => r.memberName).sort()).toEqual(["김영규", "임수환", "홍길동"]);
});

test("a meeting under the 3-member threshold is excluded regardless of agenda items", async () => {
  // 회의 B(meetingId 2)는 agendaItemMeetingIds에도 포함돼 있어 안건 게이트는 통과한다 —
  // 그럼에도 제외된다는 것은 3명 미만 게이트가 안건 게이트와 독립적으로 동작함을 증명한다.
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 B")).toBe(false);
});

test("a meeting with 3+ members but zero agendaItems rows is excluded (부의된 안건 게이트)", async () => {
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 C")).toBe(false);
});

test("numeric KPI columns are coerced to number and null KPIs stay null", async () => {
  const rows = await getInsightRows();
  const row = rows.find((r) => r.statementId === 1)!;
  expect(row.kpiEvidenceDensity).toBe(3.5);
  expect(row.kpiSolutionSpecificity).toBeNull();
  expect(row.kpiInterrogationDepth).toBeNull();
  expect(row.kpiReQuestionRate).toBeNull();
  expect(row.kpiCommitmentRate).toBeNull();
});
