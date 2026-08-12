import { test, expect, vi, beforeEach } from "vitest";

const mockStatement = { id: 1, meetingId: 1, memberId: 1, agendaItemId: null, rawText: "발언 원문", orderInMeeting: 0 };
const mockMember = { id: 1, name: "홍길동", generation: "제10대" };
const nonMemberRow = { id: 2, name: "부시장 민기식", generation: "제10대" };

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));
vi.mock("@/lib/ai/summarize", () => ({ summarizeStatement: vi.fn() }));
vi.mock("@/lib/ai/extractQaRounds", () => ({ hasQaStructure: vi.fn(), extractQaRounds: vi.fn() }));
vi.mock("@/lib/ai/matchIssues", () => ({ matchIssues: vi.fn() }));

import { db } from "@/db/client";
import { summarizeStatement } from "@/lib/ai/summarize";
import { hasQaStructure, extractQaRounds } from "@/lib/ai/extractQaRounds";
import { matchIssues } from "@/lib/ai/matchIssues";
import { issueTickets, issueReviews } from "@/db/schema";
import { processOneStatement } from "./processStatement";

// `processOneStatement` issues several different `db.select()` chain shapes:
// plain `.from().where()` for single-row lookups, and a longer
// `.from().innerJoin().where().orderBy()` chain for the following-turns query. This mock
// supports any chain length/order by having every method return a new chainable that
// resolves to the same `result` when awaited (real drizzle query builders are themselves
// thenable, which is what makes `await db.select()...chain...` work without a trailing
// `.then()` call).
function chainable(result: any[]): any {
  const node: any = {
    from: () => chainable(result),
    where: () => chainable(result),
    innerJoin: () => chainable(result),
    orderBy: () => chainable(result),
    limit: () => chainable(result),
    then: (resolve: (v: any[]) => void) => resolve(result),
  };
  return node;
}

// Some tests need to distinguish which table an `db.insert(...)` call targeted (e.g.
// `issueReviews` vs `issueTickets`), unlike the simpler tests above that only care that
// *some* insert happened. This records `{ table, values }` per `db.insert(table).values(v)`
// call so assertions can filter by table identity (real drizzle table objects imported from
// "@/db/schema", not mocked).
function trackInserts(): { table: any; values: any }[] {
  const calls: { table: any; values: any }[] = [];
  (db.insert as any).mockImplementation((table: any) => ({
    values: (v: any) => {
      calls.push({ table, values: v });
      return Promise.resolve();
    },
  }));
  return calls;
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): some tests intentionally queue a `mockReturnValueOnce`
  // that a short-circuiting code path never consumes (e.g. an unreached `getOpenTickets`
  // call). clearAllMocks only wipes call history and leaves that queued value sitting in the
  // mock's once-queue, where it would silently shift every `db.select()` call in the *next*
  // test by one. resetAllMocks drains the queue too, so each test starts from a clean slate.
  vi.resetAllMocks();
});

test("excludes non-member speakers without calling any AI function", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement]))
    .mockReturnValueOnce(chainable([nonMemberRow]));
  const insertValues = vi.fn(() => Promise.resolve());
  (db.insert as any).mockReturnValue({ values: insertValues });

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "excluded", reason: "의원 아님(집행부/사무국)" });
  expect(summarizeStatement).not.toHaveBeenCalled();
  expect(hasQaStructure).not.toHaveBeenCalled();
  expect(extractQaRounds).not.toHaveBeenCalled();
  expect(matchIssues).not.toHaveBeenCalled();
  expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ excludedReason: "의원 아님(집행부/사무국)" }));
});

test("excludes procedural statements without calling QA/issue-matching functions", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement]))
    .mockReturnValueOnce(chainable([mockMember]));
  const insertValues = vi.fn(() => Promise.resolve());
  (db.insert as any).mockReturnValue({ values: insertValues });
  (summarizeStatement as any).mockResolvedValue({
    summary: "절차 발언 요약",
    tags: ["개회"],
    isProcedural: true,
    speechType: "five_min",
    citations: [],
    proposals: [],
    selfRaisedIssues: [],
  });

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "excluded", reason: "의사진행 발언" });
  expect(hasQaStructure).not.toHaveBeenCalled();
  expect(extractQaRounds).not.toHaveBeenCalled();
  expect(matchIssues).not.toHaveBeenCalled();
});

test("computes KPIs for a substantive statement with no Q&A structure and no open tickets", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement])) // statements
    .mockReturnValueOnce(chainable([mockMember])) // members
    .mockReturnValueOnce(chainable([])) // following-speaker lookup (for hasQaStructure)
    .mockReturnValueOnce(chainable([])); // open issueTickets for this member
  const insertValues = vi.fn(() => Promise.resolve());
  (db.insert as any).mockReturnValue({ values: insertValues });
  (summarizeStatement as any).mockResolvedValue({
    summary: "실질 발언 요약",
    tags: ["예산"],
    isProcedural: false,
    speechType: "budget_review",
    citations: [{ type: "L", text: "지방재정법 제17조" }],
    proposals: [],
    selfRaisedIssues: [],
  });
  (hasQaStructure as any).mockReturnValue(false);

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "processed" });
  expect(extractQaRounds).not.toHaveBeenCalled();
  expect(matchIssues).not.toHaveBeenCalled();
  expect(insertValues).toHaveBeenCalledWith(
    expect.objectContaining({
      hasQaStructure: false,
      kpiInterrogationDepth: null,
      kpiCommitmentRate: null,
      // mockStatement.rawText = "발언 원문" (2어절), 1 citation → 1/2*100 = 50
      kpiEvidenceDensity: "50",
      kpiEvidenceDensityGrade: "A",
    })
  );
});

test("calls extractQaRounds and computes KPI3/4 when hasQaStructure returns true", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement])) // statements
    .mockReturnValueOnce(chainable([mockMember])) // members
    .mockReturnValueOnce(chainable([])); // following-speaker lookup (content irrelevant — hasQaStructure is mocked)
  const insertValues = vi.fn(() => Promise.resolve());
  (db.insert as any).mockReturnValue({ values: insertValues });
  (summarizeStatement as any).mockResolvedValue({
    summary: "질의응답 발언 요약",
    tags: ["행정사무감사"],
    isProcedural: false,
    speechType: "admin_audit",
    citations: [],
    proposals: [],
    selfRaisedIssues: [],
  });
  (hasQaStructure as any).mockReturnValue(true);
  (extractQaRounds as any).mockResolvedValue([{ roundIndex: 0, answerGrade: "확답", bonusTags: [] }]);

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "processed" });
  expect(extractQaRounds).toHaveBeenCalledWith(mockStatement.rawText, []);
  expect(matchIssues).not.toHaveBeenCalled();
  expect(insertValues).toHaveBeenCalledWith(
    expect.objectContaining({
      hasQaStructure: true,
      kpiInterrogationDepth: "1",
      kpiReQuestionRate: "0",
      kpiCommitmentRate: "1",
    })
  );
});

test("calls matchIssues when self-raised issues and open tickets both exist, and routes matched/unmatched inserts to the right tables", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement])) // statements
    .mockReturnValueOnce(chainable([mockMember])) // members
    .mockReturnValueOnce(chainable([])) // following-speaker lookup
    .mockReturnValueOnce(chainable([{ id: 5, description: "기존 이슈" }])); // open issueTickets for this member
  const insertCalls = trackInserts();
  (summarizeStatement as any).mockResolvedValue({
    summary: "이슈 제기 발언 요약",
    tags: ["도로"],
    isProcedural: false,
    speechType: "five_min",
    citations: [],
    proposals: [],
    selfRaisedIssues: [{ description: "새 이슈1" }, { description: "새 이슈2" }],
  });
  (hasQaStructure as any).mockReturnValue(false);
  (matchIssues as any).mockResolvedValue([
    { newIssueIndex: 0, matchedTicketId: 5 }, // matches existing ticket -> issueReviews
    { newIssueIndex: 1, matchedTicketId: null }, // no match -> new issueTickets row
  ]);

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "processed" });
  expect(matchIssues).toHaveBeenCalledWith(["새 이슈1", "새 이슈2"], [{ id: 5, description: "기존 이슈" }]);

  const reviewInsert = insertCalls.find((c) => c.table === issueReviews);
  expect(reviewInsert?.values).toEqual(
    expect.objectContaining({ ticketId: 5, reviewedStatementId: mockStatement.id, reviewedMeetingId: mockStatement.meetingId })
  );

  const newTicketInsert = insertCalls.find((c) => c.table === issueTickets);
  expect(newTicketInsert?.values).toEqual(
    expect.objectContaining({
      memberId: mockStatement.memberId,
      description: "새 이슈2",
      registeredStatementId: mockStatement.id,
      registeredMeetingId: mockStatement.meetingId,
    })
  );

  const insightsInsert = insertCalls.find((c) => c.values?.statementId === mockStatement.id && "opusModel" in c.values);
  expect(insightsInsert?.values).toEqual(expect.objectContaining({ opusModel: "claude-opus-5" }));
});

test("skips matchIssues and registers tickets directly when self-raised issues exist but no open tickets do", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement])) // statements
    .mockReturnValueOnce(chainable([mockMember])) // members
    .mockReturnValueOnce(chainable([])) // following-speaker lookup
    .mockReturnValueOnce(chainable([])); // no open issueTickets for this member
  const insertCalls = trackInserts();
  (summarizeStatement as any).mockResolvedValue({
    summary: "신규 이슈 제기 발언 요약",
    tags: ["공원"],
    isProcedural: false,
    speechType: "five_min",
    citations: [],
    proposals: [],
    selfRaisedIssues: [{ description: "새 이슈" }],
  });
  (hasQaStructure as any).mockReturnValue(false);

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "processed" });
  expect(matchIssues).not.toHaveBeenCalled();

  const newTicketInsert = insertCalls.find((c) => c.table === issueTickets);
  expect(newTicketInsert?.values).toEqual(
    expect.objectContaining({
      memberId: mockStatement.memberId,
      description: "새 이슈",
      registeredStatementId: mockStatement.id,
      registeredMeetingId: mockStatement.meetingId,
    })
  );
  expect(insertCalls.find((c) => c.table === issueReviews)).toBeUndefined();

  const insightsInsert = insertCalls.find((c) => c.values?.statementId === mockStatement.id && "opusModel" in c.values);
  expect(insightsInsert?.values).toEqual(expect.objectContaining({ opusModel: null }));
});
