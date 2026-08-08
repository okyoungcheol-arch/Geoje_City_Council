import { test, expect } from "vitest";
import { normalizeMemberName, MEMBER_ROSTER } from "./roster";

test("exact roster name passes through unchanged", () => {
  expect(normalizeMemberName("임수환")).toBe("임수환");
});

test("title-prefixed variants collapse to the roster name", () => {
  expect(normalizeMemberName("부의장 당선의원 임수환")).toBe("임수환");
  expect(normalizeMemberName("부의장 임수환")).toBe("임수환");
});

test("non-roster names (e.g. non-member speakers) pass through unchanged", () => {
  expect(normalizeMemberName("부시장 민기식")).toBe("부시장 민기식");
});

test("leading/trailing whitespace is trimmed even when no title prefix is present", () => {
  expect(normalizeMemberName("  최양희  ")).toBe("최양희");
});

test("roster has all 16 elected 제10대 members with no duplicates", () => {
  expect(new Set(MEMBER_ROSTER).size).toBe(MEMBER_ROSTER.length);
  expect(MEMBER_ROSTER).toHaveLength(16);
});
