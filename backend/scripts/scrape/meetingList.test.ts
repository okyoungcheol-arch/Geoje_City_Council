// backend/scripts/scrape/meetingList.test.ts
import { test, expect } from "vitest";
import { parseSessionRound, parseDocumentLabel } from "./meetingList";

test("parses the round number from a real session label", () => {
  // real label from scripts/scrape/__fixtures__/session.CT-A-th10.json
  expect(parseSessionRound("제264회 [임시회] (2026. 07. 20. ~ 2026. 07. 31.)")).toBe("제264회");
});

test("parses sitting number and date from a real document label", () => {
  // real label from scripts/scrape/__fixtures__/minutes.CT-A-th10-session264.json
  expect(parseDocumentLabel("[임시회의록] 제1차(2026.07.20.월요일)")).toEqual({
    sessionNo: "제1차",
    meetingDate: "2026-07-20",
  });
});

test("recognizes 개회식 (opening ceremony) as a valid sessionNo", () => {
  expect(parseDocumentLabel("[임시회의록] 개회식(2026.07.20.월요일)").sessionNo).toBe("개회식");
});
