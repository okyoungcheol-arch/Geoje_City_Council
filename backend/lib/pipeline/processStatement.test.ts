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

beforeEach(() => {
  vi.clearAllMocks();
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
      kpiEvidenceDensity: null, // speechDurationSec not available yet (see Task 9 Interfaces note)
    })
  );
});
