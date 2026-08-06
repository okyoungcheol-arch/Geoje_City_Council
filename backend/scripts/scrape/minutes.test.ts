// backend/scripts/scrape/minutes.test.ts
import { test, expect } from "vitest";
import fs from "node:fs";
import { parseMinutesHtml } from "./minutes";

function loadFixture() {
  return fs.readFileSync(new URL("./__fixtures__/viewer-minutes-uid5236.html", import.meta.url), "utf-8");
}

test("parses a regular speaker turn with role and name", () => {
  const statements = parseMinutesHtml(loadFixture());
  const opening = statements.find((s) => s.rawText.includes("성원이 되었으므로"));
  expect(opening).toBeDefined();
  expect(opening!.memberName).toContain("안석봉");
});

test("handles a non-member speaker with no profile link", () => {
  const statements = parseMinutesHtml(loadFixture());
  const staff = statements.find((s) => s.memberName.includes("윤병삼"));
  expect(staff).toBeDefined();
});

test("excludes 5분자유발언 turns from the returned statements", () => {
  // this specific text is the real 5분자유발언 turn captured in findings.md — it must never appear
  const statements = parseMinutesHtml(loadFixture());
  expect(statements.some((s) => s.rawText.includes("공공시설 용지 환매권 관리 강화"))).toBe(false);
});

test("excludes procedural taged-line turns and agenda-item headers from the output", () => {
  // real fixture: con_idx=0 is a "(10시 09분 개의)" taged-line with no speaker — it must not
  // surface as a statement in its own right (its text never appears standalone as rawText)
  const statements = parseMinutesHtml(loadFixture());
  expect(statements.some((s) => s.rawText === "(10시 09분 개의)")).toBe(false);
  // real fixture: con_idx=4/26/28/30/34/36/40 are item-in-contents agenda headers whose own
  // title text (e.g. "6. 휴회의 건") must never appear as a statement's rawText verbatim
  expect(statements.some((s) => s.rawText === "6. 휴회의 건")).toBe(false);
  expect(statements.every((s) => !s.rawText.includes("자유발언"))).toBe(true);
});

test("returns exactly the real, hand-verified count of non-free-speech statements", () => {
  // real fixture has 42 total contents-block turns: 1 taged-line (con_idx=0), 7 agenda-item
  // headers (con_idx=4,26,28,30,34,36,40), 21 speaker turns under the 5분자유발언 agenda
  // (con_idx=5..25, all excluded), leaving 42-1-7-21=13 legitimate statements — hand-counted
  // directly against the fixture, including turns whose speech contains an embedded
  // audience-reaction <p class="taged-line"> mid-turn (con_idx=27,29,35,39,41) which must
  // still be captured as statements, not misclassified as procedural lines.
  const statements = parseMinutesHtml(loadFixture());
  expect(statements.length).toBe(13);
  // orderInMeeting should be a strictly increasing sequence starting at 0
  statements.forEach((s, i) => expect(s.orderInMeeting).toBe(i));
  // every agenda item title (1 through 6) that isn't 5분자유발언 should be represented
  const agendas = new Set(statements.map((s) => s.agendaTitle));
  expect(agendas.has("6. 휴회의 건")).toBe(true);
  expect([...agendas].some((a) => a && /자유\s*발언/.test(a))).toBe(false);
});
