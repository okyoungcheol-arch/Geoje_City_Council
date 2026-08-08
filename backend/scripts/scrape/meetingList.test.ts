// backend/scripts/scrape/meetingList.test.ts
import { readFileSync } from "fs";
import { join } from "path";
import { test, expect } from "vitest";
import { parseLateDoHtml } from "./meetingList";

const page1Html = readFileSync(
  join(__dirname, "__fixtures__/late-do-page1.html"),
  "utf-8"
);

test("parses a real row with numbered agenda items into a ScrapedMeeting", () => {
  const rows = parseLateDoHtml(page1Html);
  const row = rows.find((r) => r.sourceMeetingId === "5242");
  expect(row).toBeDefined();
  expect(row!.category).toBe("본회의");
  expect(row!.sessionRound).toBe("제264회");
  expect(row!.sessionNo).toBe("제2차");
  expect(row!.meetingDate).toBe("2026-07-31");
  expect(row!.sourceUrl).toBe("https://www.gjcl.go.kr/viewer/minutes.do?uid=5242");
  expect(row!.title).toContain("거제시의회 제10대  제264회[임시회] 본회의 제2차 회의록");
  expect(row!.title).toContain("1. 2026년도 제1회 추가경정 세입·세출 예산안");
});

test("parses a 개회식 row with no numbered agenda items (title has no item list)", () => {
  const rows = parseLateDoHtml(page1Html);
  const row = rows.find((r) => r.sourceMeetingId === "5237");
  expect(row).toBeDefined();
  expect(row!.category).toBe("본회의");
  expect(row!.sessionNo).toBe("개회식");
  expect(row!.meetingDate).toBe("2026-07-20");
  expect(row!.title).toBe("거제시의회 제10대  제264회[임시회] 본회의 개회식 회의록");
});

test("every parsed row on page 1 is 제10대 (fixture is a known-good page)", () => {
  const rows = parseLateDoHtml(page1Html);
  expect(rows.length).toBeGreaterThan(0);
  // page1Html is confirmed (via live fetch) to be entirely 제10대 — this is a smoke
  // check that the generation filter didn't drop legitimate rows on this page.
  expect(rows.length).toBe(10);
});

test("drops rows whose 대수 column is not 제10대 (site's th_sch filter is unreliable past early pages)", () => {
  const mixedHtml = `
    <table class="normal_list"><tbody>
      <tr>
        <td>50</td><td>제10대</td><td>제264회</td><td>제1차</td>
        <td class="sbj"><a href="/viewer/minutes.do?uid=9001" title="제10대 회의">본회의<br/>[<span class="blue">임시회의록</span>]</a></td>
        <td>2026.07.01</a></td>
      </tr>
      <tr>
        <td>49</td><td>제9대</td><td>제200회</td><td>제3차</td>
        <td class="sbj"><a href="/viewer/minutes.do?uid=8001" title="제9대 회의">본회의<br/>[<span class="blue">임시회의록</span>]</a></td>
        <td>2022.05.01</a></td>
      </tr>
    </tbody></table>`;
  const rows = parseLateDoHtml(mixedHtml);
  expect(rows).toHaveLength(1);
  expect(rows[0].sourceMeetingId).toBe("9001");
});

test("skips malformed rows with no viewer link instead of throwing", () => {
  const malformedHtml = `
    <table class="normal_list"><tbody>
      <tr>
        <td>1</td><td>제10대</td><td>제264회</td><td>제1차</td>
        <td class="sbj">본회의 (링크 없음)</td>
        <td>2026.07.01</a></td>
      </tr>
    </tbody></table>`;
  expect(() => parseLateDoHtml(malformedHtml)).not.toThrow();
  expect(parseLateDoHtml(malformedHtml)).toHaveLength(0);
});
