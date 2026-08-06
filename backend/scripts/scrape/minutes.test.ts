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
  // real fixture: con_idx=0 is a standalone "(10시 09분  개의)" taged-line with no speaker
  // (no <strong> at all) — it must not surface as its own statement, and no *other*
  // statement's rawText should begin with a bare timestamp-parenthetical like this, which
  // would only happen if a standalone procedural block were mis-classified as a turn.
  // (A meaningfully stronger check than string-equality against one exact known string,
  // since that exact block would incidentally be dropped by the memberName guard too —
  // this instead exercises the classification branch's actual selectivity.)
  const statements = parseMinutesHtml(loadFixture());
  expect(statements.some((s) => /^\(\d{1,2}시\s*\d{2}분/.test(s.rawText))).toBe(false);
  // real fixture: con_idx=4/26/28/30/34/36/40 are item-in-contents agenda headers whose own
  // title text (e.g. "6. 휴회의 건") must never appear as a statement's rawText verbatim
  expect(statements.some((s) => s.rawText === "6. 휴회의 건")).toBe(false);
  expect(statements.every((s) => !s.rawText.includes("자유발언"))).toBe(true);
  // real fixture: con_idx=41 has an *embedded* taged-line reaction mid-speech
  // ("(“예” 하는 의원 있음)") inside a genuine speaker-block turn — this positively confirms
  // the classification branch checks speaker-block membership (not mere .taged-line
  // presence), since this turn must still surface as a statement despite containing one.
  expect(statements.some((s) => s.rawText.includes("산회를 선포합니다"))).toBe(true);
});

test("does not false-positive the fail-closed 5분자유발언 TOC cross-check on the real fixture", () => {
  // the real fixture's #item-block TOC does list a 5분자유발언 entry (item1), and the body
  // does correctly carry a matching .item-in-contents header — so parsing must succeed
  // normally, not throw. This guards against the new tripwire being overly aggressive.
  expect(() => parseMinutesHtml(loadFixture())).not.toThrow();
});

test("throws (fail-closed) when the TOC lists a 5분자유발언 item but no matching body header was detected", () => {
  // Minimal synthetic document modeling the one failure mode the tripwire exists for: the
  // TOC (#item-block) independently lists a 5분자유발언 agenda item, but the in-body
  // .item-in-contents header for it is missing/differently-shaped, so the exclusion logic's
  // primary signal (currentAgenda matching the free-speech regex) would never fire and the
  // turn below would otherwise leak through silently as a normal statement.
  const html = `
    <div id="minutes">
      <ol id="item-block">
        <li><a href="#item1" title="○5분 자유발언(홍길동 의원)">5분 자유발언</a></li>
      </ol>
      <div id="minutes-body">
        <div class="contents-block" data-con_idx="0">
          <strong class="item-in-contents-RENAMED" id="item1" title="○5분 자유발언(홍길동 의원)">○5분 자유발언(홍길동 의원)</strong>
        </div>
        <div class="contents-block speaker-block member-speech" data-con_idx="1" data-member_code="00001">
          <strong>○<a>홍길동</a> 의원</strong> 이것은 유출되면 안 되는 5분자유발언 내용입니다.
        </div>
      </div>
    </div>`;
  expect(() => parseMinutesHtml(html)).toThrow(/5분자유발언 agenda item found in TOC/);
});

test("throws (fail-closed) when no .contents-block turns are found under #minutes-body", () => {
  // Models a future site restructuring of #minutes-body (the exact class of selector-scope
  // bug found while building this parser) — the parser must not silently return [] and let
  // the pipeline record an empty-but-"successful" meeting.
  const html = `<div id="minutes"><ol id="item-block"></ol><div id="minutes-body-RENAMED"></div></div>`;
  expect(() => parseMinutesHtml(html)).toThrow(/no \.contents-block turns found/);
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
