import { test, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { matches: [{ newIssueIndex: 0, matchedTicketId: 12 }, { newIssueIndex: 1, matchedTicketId: null }] },
  }),
}));

import { matchIssues, MatchSchema } from "./matchIssues";

test("returns matched ticket id per new issue, null when no match", async () => {
  const result = await matchIssues(
    ["실내빙상관 공백 해소 진행 상황 재확인", "새로운 이슈"],
    [{ id: 12, description: "실내빙상관 유사시설 중복 여부 점검" }]
  );

  expect(result).toEqual([
    { newIssueIndex: 0, matchedTicketId: 12 },
    { newIssueIndex: 1, matchedTicketId: null },
  ]);
});

test("MatchSchema validates correct match objects", () => {
  // Valid full match object
  const validMatch = {
    matches: [{ newIssueIndex: 0, matchedTicketId: 12 }],
  };
  expect(MatchSchema.safeParse(validMatch).success).toBe(true);

  // Valid no-match object (null is allowed)
  const validNoMatch = {
    matches: [{ newIssueIndex: 0, matchedTicketId: null }],
  };
  expect(MatchSchema.safeParse(validNoMatch).success).toBe(true);

  // Valid multiple matches
  const validMultiple = {
    matches: [
      { newIssueIndex: 0, matchedTicketId: 12 },
      { newIssueIndex: 1, matchedTicketId: null },
    ],
  };
  expect(MatchSchema.safeParse(validMultiple).success).toBe(true);
});

test("MatchSchema rejects invalid match objects", () => {
  // Missing newIssueIndex
  const missingIndex = {
    matches: [{ matchedTicketId: 12 }],
  };
  expect(MatchSchema.safeParse(missingIndex).success).toBe(false);

  // matchedTicketId as string (should be number | null)
  const invalidTicketType = {
    matches: [{ newIssueIndex: 0, matchedTicketId: "12" }],
  };
  expect(MatchSchema.safeParse(invalidTicketType).success).toBe(false);

  // newIssueIndex as float (should be int)
  const floatIndex = {
    matches: [{ newIssueIndex: 0.5, matchedTicketId: 12 }],
  };
  expect(MatchSchema.safeParse(floatIndex).success).toBe(false);

  // Negative newIssueIndex
  const negativeIndex = {
    matches: [{ newIssueIndex: -1, matchedTicketId: 12 }],
  };
  expect(MatchSchema.safeParse(negativeIndex).success).toBe(false);
});
