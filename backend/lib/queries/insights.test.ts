import { test, expect, vi } from "vitest";
import { getInsightRows, getMemberIssuePersistence } from "./insights";
import { issueTickets, issueReviews } from "@/db/schema";

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
// 회의 B(meetingId 2): 정규화 후 1명뿐(임수환 중복 표기가 한 명으로 합쳐짐) -> v2.1부터
//   MIN_SUBSTANTIVE_MEMBERS_PER_MEETING=1이라 포함(예: 264회 본회의 제2차처럼 5분자유발언
//   참석자가 많고 안건 토의 참여자가 1명뿐인 회의도 목록에서 사라지지 않아야 한다).
// 회의 C(meetingId 3): 실질 발언 의원 3명이지만 agendaItems가 0건(개회식류) -> 제외.
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

// meetingId 1, 2에는 agendaItems가 있음. meetingId 3(회의 C)은 agendaItems가 0건(개회식류 시나리오).
const agendaItemMeetingIds = [{ meetingId: 1 }, { meetingId: 2 }];

// getMemberIssuePersistence fixtures — kept separate from the getInsightRows fixture above
// since it queries issueTickets/issueReviews (member-level accumulation), not statementInsights.
//
// 김영규: 4 tickets across 3 distinct meetings (201/202/203, one meeting has 2 tickets),
//   2 of 4 reviewed (101, 103) -> 3+ sessions -> "scored", rate 2/4=0.5 -> grade "B".
// 홍길동: 3 tickets across only 2 distinct meetings (301/302) -> below the 3-session
//   threshold -> "tracking" regardless of ticket count, none reviewed.
// 부의장 임수환 / 임수환: same real member, registered under two differently-formatted name
//   strings (mirrors the normalizeMemberName scenario already covered for getInsightRows
//   above) -> must aggregate into a single entry, one ticket per distinct meeting (401/402/403).
const ticketRowsFixture = [
  { memberName: "김영규", ticketId: 101, registeredMeetingId: 201 },
  { memberName: "김영규", ticketId: 102, registeredMeetingId: 202 },
  { memberName: "김영규", ticketId: 103, registeredMeetingId: 203 },
  { memberName: "김영규", ticketId: 104, registeredMeetingId: 203 },
  { memberName: "홍길동", ticketId: 105, registeredMeetingId: 301 },
  { memberName: "홍길동", ticketId: 106, registeredMeetingId: 301 },
  { memberName: "홍길동", ticketId: 107, registeredMeetingId: 302 },
  { memberName: "부의장 임수환", ticketId: 201, registeredMeetingId: 401 },
  { memberName: "임수환", ticketId: 202, registeredMeetingId: 402 },
  { memberName: "임수환", ticketId: 203, registeredMeetingId: 403 },
];
const reviewedTicketIdsFixture = [{ ticketId: 101 }, { ticketId: 103 }];

// A chainable+thenable stub: getInsightRows() terminates its chain with `.where(...)`, while
// getMemberIssuePersistence() awaits the innerJoin/from result directly with no `.where()`.
// Making every stage both chainable (innerJoin/where return another stage) and thenable
// (awaitable on its own) lets one stub satisfy both call shapes.
function chainable(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    innerJoin: () => chainable(rows),
    where: () => Promise.resolve(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        if (table === issueTickets) return chainable(ticketRowsFixture);
        if (table === issueReviews) return chainable(reviewedTicketIdsFixture);
        return chainable(fixture); // statementInsights flow (getInsightRows)
      },
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

test("a meeting with only one substantive member after name normalization is still included (v2.1: threshold=1)", async () => {
  // 회의 B(meetingId 2)는 "임수환"/"부의장 임수환"이 정규화 후 한 명으로 합쳐져 실질 발언
  // 의원이 1명뿐이지만, MIN_SUBSTANTIVE_MEMBERS_PER_MEETING=1이므로 여전히 포함되어야 한다
  // — 264회 본회의 제2차처럼 5분자유발언 참석자가 많고 안건 토의 참여자가 1명뿐인 회의가
  // 통째로 걸러지지 않게 하려는 의도적인 완화다.
  const rows = await getInsightRows();
  const meetingB = rows.filter((r) => r.meetingTitle === "회의 B");
  expect(meetingB).toHaveLength(2);
  expect(meetingB.map((r) => r.memberName)).toEqual(["임수환", "임수환"]);
});

test("a meeting with 3 members but zero agendaItems rows is excluded (부의된 안건 게이트)", async () => {
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

test("a member with 3+ distinct registeredMeetingId values and mixed reviewed/unreviewed tickets is scored with a correct rate and grade", async () => {
  const results = await getMemberIssuePersistence();
  const entry = results.find((r) => r.memberName === "김영규")!;
  expect(entry.status).toBe("scored");
  expect(entry.totalIssues).toBe(4);
  expect(entry.reviewedIssues).toBe(2);
  expect(entry.rate).toBe(0.5); // 2/4, rounded per getMemberIssuePersistence's Math.round(...*100)/100
  expect(entry.grade).toBe("B"); // computeIssuePersistenceGrade: 0.4 <= 0.5 < 0.6
});

test("a member with fewer than 3 distinct registeredMeetingId values is tracking regardless of ticket count", async () => {
  const results = await getMemberIssuePersistence();
  const entry = results.find((r) => r.memberName === "홍길동")!;
  // 3 tickets but only 2 distinct meetings (301 appears twice) -> below MIN_SESSIONS_FOR_RATE.
  expect(entry.totalIssues).toBe(3);
  expect(entry.status).toBe("tracking");
  expect(entry.rate).toBeNull();
  expect(entry.grade).toBeNull();
});

test("tickets registered under differently-formatted name variants aggregate into a single member entry", async () => {
  const results = await getMemberIssuePersistence();
  // "부의장 임수환" (1 ticket) and "임수환" (2 tickets) must normalize to one "임수환" entry,
  // not two separate rows — same normalizeMemberName concern already covered for
  // getInsightRows() above, but exercised here through getMemberIssuePersistence's own
  // independent aggregation path.
  const matching = results.filter((r) => r.memberName === "임수환");
  expect(matching).toHaveLength(1);
  expect(matching[0].totalIssues).toBe(3);
});

test("a ticketId present in issueReviews counts as reviewed; one absent counts as unreviewed", async () => {
  const results = await getMemberIssuePersistence();
  const entry = results.find((r) => r.memberName === "김영규")!;
  // Of 김영규's 4 tickets (101-104), only 101 and 103 appear in reviewedTicketIdsFixture.
  expect(entry.reviewedIssues).toBe(2);
  expect(entry.totalIssues - entry.reviewedIssues).toBe(2); // 102, 104 stay unreviewed
});
