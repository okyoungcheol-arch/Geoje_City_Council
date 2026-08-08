# 스크래퍼 소스 교체(late.do) + 부의된 안건 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스크래퍼의 회의 목록 수집원을 `committee.do` 기반 CSRF 트리에서 `late.do` 기반 단순 페이지네이션으로 교체하고, 부의된 안건이 없는 회의(개회식 등)를 `getInsightRows()` 결과에서 제외한다.

**Architecture:** `backend/scripts/scrape/meetingList.ts`가 `late.do?...&page=N`을 Playwright로 받아 cheerio로 파싱한다. 사이트의 `th_sch=10` 쿼리 파라미터는 몇 페이지 지나면 신뢰할 수 없음을 실측 확인했으므로(뒤 Global Constraints 참조), 파서 자체가 각 행의 "대수" 컬럼을 검사해 "제10대"가 아닌 행을 걸러내고, 그 결과 배열이 비면 페이지네이션을 종료한다. `session.ts`(CSRF)는 더 이상 쓰이지 않아 삭제한다. `getInsightRows()`에는 기존 "3명 미만 회의 제외" 게이트와 같은 패턴으로 "부의된 안건(agendaItems) 0건 회의 제외" 게이트를 추가한다.

**Tech Stack:** Next.js/TypeScript backend, Drizzle ORM + Postgres(Neon), Playwright(`playwright-core` + `@sparticuz/chromium`), cheerio, Vitest.

## Global Constraints

- 대상 범위는 **제10대**만. 5분자유발언은 절대 수집/처리하지 않는다 (기존 `minutes.ts`의 `isFreeSpeechAgenda` 로직, 이번 계획에서 변경하지 않음).
- **영상 기능 전면 금지** — 이번 작업과 무관하지만 프로젝트 전역 제약.
- 스크래핑은 요청 사이 1~2초 지연, robots.txt 준수. 병렬로 몰아서 요청하지 않는다.
- 파이프라인/스크래퍼는 재실행해도 안전해야 한다 (이미 처리된 `sourceMeetingId`는 upsert로 자연스럽게 처리됨, 변경 없음).
- **`th_sch=10` 쿼리 파라미터는 신뢰할 수 없다** — 실측 확인: page=1은 전부 제10대이지만 page=5, 9, 10, 30, 50은 전부 제9대, page=100은 제8대, page=444("마지막 페이지")·445는 전부 제1대(1991년)다. 사이트의 페이지네이션 총량(444)은 전체 대수를 합친 고정값이며 `th_sch` 필터와 무관하다. **모든 페이지 파싱 결과는 각 행의 "대수" 컬럼 값이 정확히 `"제10대"`인지 코드로 직접 검증해야 하며, 쿼리 파라미터만 믿고 저장해서는 안 된다.**
- `meetings.sourceMeetingId`는 unique index 대상이다 — 새 파서는 반드시 목록의 "번호" 컬럼이 아니라 `href="/viewer/minutes.do?uid=N"`의 **uid**를 `sourceMeetingId`로 써야 한다(기존 스크래퍼와 동일한 값 체계를 유지해야 이미 스크랩된 회의가 중복 삽입되지 않는다).
- `ScrapedMeeting` 인터페이스(필드: `sourceMeetingId`, `category`, `title`, `sessionRound`, `sessionNo`, `meetingDate`, `sourceUrl`)는 **필드를 바꾸지 않는다** — `upsertMeeting.ts`, `scrape-meeting/route.ts`의 Zod 스키마, `mobile/src/lib/adminApi.ts`가 전부 이 필드 이름에 의존하며, 그대로 유지하면 이 파일들은 손댈 필요가 없다(레포 전체 grep으로 다른 소비처 없음을 이미 확인함).

**참고 파일 (읽기 전용, 값/구조 출처):**
- `backend/scripts/scrape/__fixtures__/late-do-page1.html` — 이번 계획을 위해 실제로 캡처한 late.do 1페이지 응답. 정확한 테이블/셀 마크업의 근거.
- `docs/superpowers/specs/2026-08-08-gjcl-late-do-scraper-migration-design.md` — 이 계획의 design spec.
- `backend/scripts/scrape/minutes.ts` — 5분자유발언 제외 로직 및 `agendaItems` 생성 원리(변경 없음, 참고용).

**태스크 실행 순서 중요**: Task 1(파서) → Task 2(run.ts) → Task 3(check-new-meetings) → Task 4(session.ts 삭제, 이 시점에야 안전) → Task 5(insights 게이트) → Task 6(문서) → Task 7(검증) → Task 8(배포). 반드시 이 순서대로 실행한다 — Task 4를 앞당기면 Task 2·3 착수 전까지 빌드가 깨진다.

---

### Task 1: `meetingList.ts` 전면 재작성 — late.do 파서

**Files:**
- Modify: `backend/scripts/scrape/meetingList.ts` (전체 재작성)
- Modify: `backend/scripts/scrape/meetingList.test.ts` (전체 재작성)

**Interfaces:**
- Produces:
  - `export interface ScrapedMeeting { sourceMeetingId: string; category: string; title: string; sessionRound: string; sessionNo: string; meetingDate: string | null; sourceUrl: string; }` (필드 불변)
  - `export function parseLateDoHtml(html: string): ScrapedMeeting[]` — 순수 함수, "대수" !== "제10대"인 행은 내부에서 걸러냄
  - `export async function scrapeLateDoPage(page: Page, pageNo: number): Promise<ScrapedMeeting[]>`

- [ ] **Step 1: 실패하는 테스트 작성** (`backend/scripts/scrape/meetingList.test.ts` 전체 교체)

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run scripts/scrape/meetingList.test.ts`
Expected: FAIL — `parseLateDoHtml`가 아직 없음(`Cannot find module` 또는 `is not a function`).

- [ ] **Step 3: 최소 구현 작성** (`backend/scripts/scrape/meetingList.ts` 전체 교체)

```ts
// backend/scripts/scrape/meetingList.ts
import type { Page } from "playwright-core";
import * as cheerio from "cheerio";

export interface ScrapedMeeting {
  sourceMeetingId: string;
  category: string;
  title: string;
  sessionRound: string;
  sessionNo: string;
  meetingDate: string | null;
  sourceUrl: string;
}

const TARGET_GENERATION = "제10대";

function buildLateDoUrl(pageNo: number): string {
  const url = new URL("https://www.gjcl.go.kr/kr/minutes/late.do");
  url.searchParams.set("schwrd", "");
  url.searchParams.set("flag", "all");
  url.searchParams.set("mem_sch", "");
  url.searchParams.set("th_sch", "10");
  url.searchParams.set("page", String(pageNo));
  url.searchParams.set("list_style", "");
  url.searchParams.set("cmt_cd_sch", "");
  return url.toString();
}

function parseDate(text: string): string | null {
  const m = text.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Pure function: HTML -> ScrapedMeeting[], filtered to TARGET_GENERATION only. The site's
// th_sch=10 query param is NOT reliable past the first few pages (confirmed live: page 1 is
// all 제10대, but page 5+ silently returns 제9대/제8대/제1대 rows even with th_sch=10 still in
// the URL — the site's total page count, 444, is a fixed all-generation figure unrelated to
// the filter). This function is the real generation gate. An empty return means "no 제10대
// rows on this page" — callers use that as the pagination-loop termination signal. This is
// safe even on a transition page where 제10대 and older rows are mixed: only the non-matching
// rows on that page are dropped, and the next page will be fully non-matching, terminating
// the loop there.
export function parseLateDoHtml(html: string): ScrapedMeeting[] {
  const $ = cheerio.load(html);
  const meetings: ScrapedMeeting[] = [];

  $("table.normal_list tbody tr").each((_, el) => {
    const $cells = $(el).find("td");
    if ($cells.length < 6) return; // defensive: skip malformed rows

    const generation = $($cells[1]).text().trim();
    if (generation !== TARGET_GENERATION) return;

    const $link = $($cells[4]).find("a").first();
    const href = $link.attr("href") ?? "";
    const uidMatch = href.match(/uid=(\d+)/);
    if (!uidMatch) return; // defensive: skip rows with no viewer link

    const title = $link.attr("title")?.trim() || "";
    const category = $link.contents().first().text().trim();
    const sessionRound = $($cells[2]).text().trim();
    const sessionNo = $($cells[3]).text().trim();
    const meetingDate = parseDate($($cells[5]).text().trim());

    meetings.push({
      sourceMeetingId: uidMatch[1],
      category,
      title,
      sessionRound,
      sessionNo,
      meetingDate,
      sourceUrl: `https://www.gjcl.go.kr/viewer/minutes.do?uid=${uidMatch[1]}`,
    });
  });

  return meetings;
}

// Fetches one late.do page via an already-open Playwright Page (caller owns browser
// lifecycle — see run.ts / check-new-meetings/route.ts). No CSRF/session needed: late.do is
// a plain server-rendered GET, confirmed via live fetch.
export async function scrapeLateDoPage(page: Page, pageNo: number): Promise<ScrapedMeeting[]> {
  await page.goto(buildLateDoUrl(pageNo));
  const html = await page.content();
  return parseLateDoHtml(html);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run scripts/scrape/meetingList.test.ts`
Expected: PASS — 5개 테스트 전부 통과.

- [ ] **Step 5: 커밋**

```bash
cd backend
git add scripts/scrape/meetingList.ts scripts/scrape/meetingList.test.ts scripts/scrape/__fixtures__/late-do-page1.html
git commit -m "feat(backend): replace committee.do scraper with late.do parser"
```

---

### Task 2: `run.ts` 재구성 — 전체 백필 스크립트

**Files:**
- Modify: `backend/scripts/scrape/run.ts`

**Interfaces:**
- Consumes: `launchChromium` (`@/scripts/scrape/launchBrowser`, 기존, 변경 없음), `scrapeLateDoPage` (Task 1), `upsertScrapedMeeting` (`@/lib/scrape/upsertMeeting`, 기존, 변경 없음)

이 파일은 CLI로 수동 실행하는 스크립트라 자동 테스트 대상이 아니다(기존에도 테스트 파일 없음). Task 7의 라이브 스모크 테스트에서 실제로 실행해 검증한다.

- [ ] **Step 1: 재작성**

```ts
// backend/scripts/scrape/run.ts
import { launchChromium } from "./launchBrowser";
import { scrapeLateDoPage } from "./meetingList";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await launchChromium();
  const page = await browser.newPage();
  const failures: { title: string; sourceUrl: string; error: string }[] = [];
  let pageNo = 1;
  let totalMeetings = 0;

  try {
    while (true) {
      await sleep(1500); // polite delay before each late.do page request
      const rows = await scrapeLateDoPage(page, pageNo);
      if (rows.length === 0) break; // no more 제10대 rows on this page or beyond

      for (const m of rows) {
        await sleep(1500); // polite delay before each minutes document fetch

        // A single meeting's browser launch/parse can fail transiently — this is a long,
        // multi-page run across the whole 제10대 term, so one bad meeting must not abort
        // the whole scrape. Catch, record, and move on.
        try {
          const { statementsAdded } = await upsertScrapedMeeting(m);
          console.log(`Scraped: ${m.title} (${statementsAdded} new statements, page=${pageNo})`);
          totalMeetings++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`FAILED: ${m.title} (page=${pageNo}, url=${m.sourceUrl}): ${message}`);
          failures.push({ title: m.title, sourceUrl: m.sourceUrl, error: message });
        }
      }
      pageNo++;
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ${totalMeetings} meeting(s) processed across ${pageNo - 1} page(s). ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log(JSON.stringify(failures, null, 2));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
```

- [ ] **Step 2: 타입 체크**

Run: `cd backend && npx tsc --noEmit`
Expected: 이 파일 자체는 에러 없음. `run.ts`가 여전히 `session.ts`를 참조하는 다른 파일(`check-new-meetings/route.ts`, Task 3에서 갱신 예정)에는 영향 없음 — 그 파일은 아직 옛 코드라 기존과 동일하게 동작 중이어야 한다(회귀 아님).

- [ ] **Step 3: 커밋**

```bash
git add scripts/scrape/run.ts
git commit -m "refactor(backend): rebuild full-backfill script around late.do pagination"
```

---

### Task 3: `check-new-meetings/route.ts` 재구성 — 조기 종료

**Files:**
- Modify: `backend/app/api/admin/check-new-meetings/route.ts`
- Modify: `backend/app/api/admin/check-new-meetings/route.test.ts`

**Interfaces:**
- Consumes: `launchChromium`, `scrapeLateDoPage`, `type ScrapedMeeting` (Task 1)
- Produces: `POST` 핸들러 시그니처·응답 형식(`{ newMeetings: ScrapedMeeting[] }`) 불변.

- [ ] **Step 1: 실패하는 테스트 작성** (`route.test.ts` 전체 교체)

```ts
// backend/app/api/admin/check-new-meetings/route.test.ts
import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const scrapeLateDoPageMock = vi.fn();

vi.mock("@/scripts/scrape/launchBrowser", () => ({
  launchChromium: vi.fn(() =>
    Promise.resolve({ newPage: () => Promise.resolve({}), close: vi.fn() })
  ),
}));
vi.mock("@/scripts/scrape/meetingList", () => ({
  scrapeLateDoPage: scrapeLateDoPageMock,
}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => Promise.resolve([{ sourceMeetingId: "100" }]) }) },
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/admin/check-new-meetings", {
    method: "POST",
    headers: { "x-admin-pin": "1234" },
  });
}

test("returns only meetings not already in the DB", async () => {
  scrapeLateDoPageMock.mockReset();
  scrapeLateDoPageMock.mockImplementation((_page: unknown, pageNo: number) =>
    Promise.resolve(
      pageNo === 1
        ? [
            { sourceMeetingId: "100", category: "본회의", title: "기존 회의", sessionRound: "제264회", sessionNo: "제1차", meetingDate: "2026-07-20", sourceUrl: "https://x/100" },
            { sourceMeetingId: "200", category: "본회의", title: "신규 회의", sessionRound: "제265회", sessionNo: "제1차", meetingDate: "2026-08-10", sourceUrl: "https://x/200" },
          ]
        : []
    )
  );

  const res = await POST(makeRequest());
  const body = await res.json();
  expect(body.newMeetings).toHaveLength(1);
  expect(body.newMeetings[0].sourceMeetingId).toBe("200");
});

test("stops paginating once a page is entirely already-known meetings (early exit)", async () => {
  scrapeLateDoPageMock.mockReset();
  scrapeLateDoPageMock.mockImplementation((_page: unknown, pageNo: number) =>
    Promise.resolve(
      pageNo === 1
        ? [{ sourceMeetingId: "100", category: "본회의", title: "기존 회의", sessionRound: "제264회", sessionNo: "제1차", meetingDate: "2026-07-20", sourceUrl: "https://x/100" }]
        : [{ sourceMeetingId: "999", category: "본회의", title: "절대 도달하면 안 됨", sessionRound: "제1회", sessionNo: "제1차", meetingDate: "2020-01-01", sourceUrl: "https://x/999" }]
    )
  );

  const res = await POST(makeRequest());
  const body = await res.json();
  expect(body.newMeetings).toHaveLength(0);
  expect(scrapeLateDoPageMock).toHaveBeenCalledTimes(1); // page 2 must never be fetched
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/check-new-meetings", { method: "POST" });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run app/api/admin/check-new-meetings/route.test.ts`
Expected: FAIL — `route.ts`가 아직 옛 `openCouncilSession`/`scrapeCategories`/`scrapeMeetingList`를 import하므로 mock 경로가 안 맞아 에러(모듈을 찾을 수 없거나 mock되지 않은 실제 함수가 호출되어 실패).

- [ ] **Step 3: 최소 구현 작성**

```ts
// backend/app/api/admin/check-new-meetings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { launchChromium } from "@/scripts/scrape/launchBrowser";
import { scrapeLateDoPage, type ScrapedMeeting } from "@/scripts/scrape/meetingList";
import { db } from "@/db/client";
import { meetings } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

// Safety cap. late.do is newest-first, so a page with zero unseen 제10대 rows means every
// later page is also fully known/older-generation — confirmed live that 제10대 rows run out
// well before page 10, so 50 is a generous ceiling against a 300s budget, not an expected case.
const MAX_PAGES_PER_CHECK = 50;

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const existingRows = await db.select({ sourceMeetingId: meetings.sourceMeetingId }).from(meetings);
  const existingIds = new Set(existingRows.map((r) => r.sourceMeetingId));

  const browser = await launchChromium();
  const newMeetings: ScrapedMeeting[] = [];
  try {
    const page = await browser.newPage();
    for (let pageNo = 1; pageNo <= MAX_PAGES_PER_CHECK; pageNo++) {
      const rows = await scrapeLateDoPage(page, pageNo);
      if (rows.length === 0) break; // no more 제10대 rows on this page or beyond

      const unseen = rows.filter((m) => !existingIds.has(m.sourceMeetingId));
      newMeetings.push(...unseen);

      // Newest-first ordering: if every row on this page is already known, every row on
      // every subsequent page is even older and also already known.
      if (unseen.length === 0) break;
    }
  } finally {
    await browser.close();
  }

  return NextResponse.json({ newMeetings });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run app/api/admin/check-new-meetings/route.test.ts`
Expected: PASS — 3개 테스트 전부 통과, 특히 "early exit" 테스트가 `scrapeLateDoPageMock`이 정확히 1번만 호출됐음을 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/api/admin/check-new-meetings/route.ts app/api/admin/check-new-meetings/route.test.ts
git commit -m "refactor(backend): rebuild check-new-meetings around late.do with early exit"
```

---

### Task 4: `session.ts` 및 구 fixture 삭제

**Files:**
- Delete: `backend/scripts/scrape/session.ts`
- Delete: `backend/scripts/scrape/__fixtures__/committeeRoot.CT.json`
- Delete: `backend/scripts/scrape/__fixtures__/session.CT-A-th10.json`
- Delete: `backend/scripts/scrape/__fixtures__/minutes.CT-A-th10-session264.json`
- Delete: `backend/scripts/scrape/__fixtures__/th.CT-A.json`

**Interfaces:** 없음(삭제만). Task 2·3이 끝나 `openCouncilSession`/`postAsync`/`CouncilSession`/`scrapeCategories`/`scrapeMeetingList`/`parseSessionRound`/`parseDocumentLabel`의 실제 사용처가 전부 사라진 지금 실행하는 것이 안전하다.

- [ ] **Step 1: 참조 재확인**

Run (PowerShell, `backend` 디렉터리에서):
```powershell
Get-ChildItem -Recurse -Include *.ts | Select-String "openCouncilSession|postAsync|CouncilSession|scrapeCategories|scrapeMeetingList|parseSessionRound|parseDocumentLabel" | Where-Object { $_.Path -notmatch "session\.ts" }
```
Expected: 빈 결과.

- [ ] **Step 2: 삭제**

```bash
cd backend
git rm scripts/scrape/session.ts
git rm scripts/scrape/__fixtures__/committeeRoot.CT.json
git rm scripts/scrape/__fixtures__/session.CT-A-th10.json
git rm scripts/scrape/__fixtures__/minutes.CT-A-th10-session264.json
git rm scripts/scrape/__fixtures__/th.CT-A.json
```

- [ ] **Step 3: 타입 체크 + 테스트**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: 둘 다 에러 0건.

- [ ] **Step 4: 커밋**

```bash
git commit -m "chore(backend): remove unused CSRF session scraper and stale fixtures"
```

---

### Task 5: `getInsightRows()` — 부의된 안건 게이트

**Files:**
- Modify: `backend/lib/queries/insights.ts`
- Modify: `backend/lib/queries/insights.test.ts`

현재 파일(이번 세션 앞서 추가된 이름 정규화 + 3명 미만 회의 제외 게이트가 이미 반영된 상태)에 이어서 작업한다.

**Interfaces:**
- Produces: `InsightRow`에 `meetingId: number` 필드 추가(그 외 필드 불변). `getInsightRows(): Promise<InsightRow[]>` 시그니처 불변.

- [ ] **Step 1: 실패하는 테스트 작성** (`insights.test.ts` 전체 교체)

```ts
// backend/lib/queries/insights.test.ts
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
    creativity: null,
    feasibility: 4,
    evidenceLegal: 5,
    persistence: null,
    persistenceStatus: "pending_future_evaluation",
    oversight: 3,
    citizenBenefit: 4,
    futureStrategy: 3,
    cityDevelopment: 4,
    weightedScore: "3.93",
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

// meetingId 1에만 agendaItems가 있음 (회의 C=3은 없음 — 개회식류 시나리오)
const agendaItemMeetingIds = [{ meetingId: 1 }];

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
});

test("a meeting under the 3-member threshold is excluded regardless of agenda items", async () => {
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 B")).toBe(false);
});

test("a meeting with 3+ members but zero agendaItems rows is excluded (부의된 안건 게이트)", async () => {
  const rows = await getInsightRows();
  expect(rows.some((r) => r.meetingTitle === "회의 C")).toBe(false);
});

test("weightedScore is coerced to number and nullable axes stay null", async () => {
  const rows = await getInsightRows();
  const row = rows.find((r) => r.statementId === 1)!;
  expect(row.weightedScore).toBe(3.93);
  expect(row.creativity).toBeNull();
  expect(row.persistenceStatus).toBe("pending_future_evaluation");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run lib/queries/insights.test.ts`
Expected: FAIL — "회의 C" 테스트가 실패(현재 코드는 agendaItems 게이트가 없어 회의 C가 포함됨). `db.selectDistinct` mock이 사용되지 않아 `getInsightRows()` 내부에서 이를 호출하지 않는다는 것 자체가 게이트 미구현의 증거.

- [ ] **Step 3: 구현** — `backend/lib/queries/insights.ts`에 게이트 추가

```ts
// backend/lib/queries/insights.ts
import { db } from "@/db/client";
import { meetings, members, statements, statementInsights, agendaItems } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import { normalizeMemberName } from "@/lib/members/roster";

const MIN_SUBSTANTIVE_MEMBERS_PER_MEETING = 3;

export interface InsightRow {
  statementId: number;
  meetingId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  creativity: number | null;
  feasibility: number;
  evidenceLegal: number;
  persistence: number | null;
  persistenceStatus: string;
  oversight: number;
  citizenBenefit: number;
  futureStrategy: number;
  cityDevelopment: number;
  weightedScore: number;
  summary: string;
  rawText: string;
  rationale: string;
}

export async function getInsightRows(): Promise<InsightRow[]> {
  const [rows, meetingsWithAgendaItems] = await Promise.all([
    db
      .select({
        statementId: statements.id,
        meetingId: statements.meetingId,
        meetingTitle: meetings.title,
        memberName: members.name,
        tags: statementInsights.tags,
        topicsToWatch: statementInsights.topicsToWatch,
        speechType: statementInsights.speechType,
        creativity: statementInsights.creativity,
        feasibility: statementInsights.feasibility,
        evidenceLegal: statementInsights.evidenceLegal,
        persistence: statementInsights.persistence,
        persistenceStatus: statementInsights.persistenceStatus,
        oversight: statementInsights.oversight,
        citizenBenefit: statementInsights.citizenBenefit,
        futureStrategy: statementInsights.futureStrategy,
        cityDevelopment: statementInsights.cityDevelopment,
        weightedScore: statementInsights.weightedScore,
        summary: statementInsights.summary,
        rawText: statements.rawText,
        rationale: statementInsights.rationale,
      })
      .from(statementInsights)
      .innerJoin(statements, eq(statementInsights.statementId, statements.id))
      .innerJoin(meetings, eq(statements.meetingId, meetings.id))
      .innerJoin(members, eq(statements.memberId, members.id))
      .where(isNull(statementInsights.excludedReason)),

    // 부의된 안건(formally-tabled agenda item) 게이트: CLAUDE.md §1.1 "부의된 안건이 있는
    // 회의만 평가". 회의가 agendaItems 0건이면 부의된 안건이 없는 것과 동치다 —
    // upsertMeeting.ts가 5분자유발언을 제외한 실제 안건만 agendaItems로 적재하기 때문에
    // (minutes.ts의 5분자유발언 섹션 전체 드롭 로직 참조), 별도 HTML 파싱이 필요 없다.
    // JOIN이 아니라 별도 쿼리로 병렬 실행하는 이유: agendaItems는 회의당 1:N이라, meetings에
    // 직접 JOIN하면 위 statementInsights 기본 행이 안건 개수만큼 중복된다.
    db.selectDistinct({ meetingId: agendaItems.meetingId }).from(agendaItems),
  ]);

  const meetingIdsWithAgendaItems = new Set(meetingsWithAgendaItems.map((r) => r.meetingId));

  const normalized = rows.map((r) => ({
    ...r,
    memberName: normalizeMemberName(r.memberName),
    tags: r.tags ?? [],
    topicsToWatch: r.topicsToWatch ?? [],
    speechType: r.speechType!,
    feasibility: r.feasibility!,
    evidenceLegal: r.evidenceLegal!,
    persistenceStatus: r.persistenceStatus!,
    oversight: r.oversight!,
    citizenBenefit: r.citizenBenefit!,
    futureStrategy: r.futureStrategy!,
    cityDevelopment: r.cityDevelopment!,
    weightedScore: Number(r.weightedScore),
    rationale: r.rationale!,
  }));

  const membersByMeeting = new Map<string, Set<string>>();
  for (const r of normalized) {
    const set = membersByMeeting.get(r.meetingTitle) ?? new Set<string>();
    set.add(r.memberName);
    membersByMeeting.set(r.meetingTitle, set);
  }
  const qualifyingMeetingTitles = new Set(
    [...membersByMeeting.entries()]
      .filter(([, memberSet]) => memberSet.size >= MIN_SUBSTANTIVE_MEMBERS_PER_MEETING)
      .map(([title]) => title)
  );

  return normalized.filter(
    (r) => qualifyingMeetingTitles.has(r.meetingTitle) && meetingIdsWithAgendaItems.has(r.meetingId)
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run lib/queries/insights.test.ts`
Expected: PASS — 4개 테스트 전부 통과.

- [ ] **Step 5: 관련 route 테스트도 회귀 확인**

Run: `cd backend && npx vitest run app/api/insights/route.test.ts`
Expected: PASS (이 파일은 `getInsightRows`를 모킹하므로 내부 구현 변경에 영향받지 않음 — 회귀 없음 확인용).

- [ ] **Step 6: 커밋**

```bash
git add lib/queries/insights.ts lib/queries/insights.test.ts
git commit -m "feat(backend): exclude meetings with zero formally-tabled agenda items"
```

---

### Task 6: 문서 업데이트

**Files:**
- Modify: `CLAUDE.md` (루트)
- Modify: `docs/rubric/CLAUDE.md`
- Modify: `harness.md`

- [ ] **Step 1: 루트 `CLAUDE.md`** — "반드시 지켜야 할 규칙 (Global Constraints)" 섹션에서 기존 3명 규칙 바로 아래에 같은 문체로 추가:

```markdown
- 회의 목록 수집은 `https://www.gjcl.go.kr/kr/minutes/late.do`(페이지네이션 기반)를 사용한다 — 과거 committee.do 기반 CSRF 트리(committeeRoot.do → session.do → minutes.do)는 폐기되었다. 사이트의 `th_sch=10` 쿼리 파라미터는 몇 페이지 지나면 신뢰할 수 없으므로(실측: page 5 이상부터 다른 대수 섞임), 스크래퍼는 각 행의 "대수" 컬럼을 직접 검증해 "제10대"가 아닌 행을 저장하지 않는다.
- `getInsightRows()`는 부의된 안건(formally-tabled agenda item)이 하나도 없는 회의(예: 개회식)도 결과에서 제외한다 — 해당 회의가 `agendaItems`에 0건인지로 판별하며(별도 HTML 파싱 불필요, `upsertMeeting.ts`가 5분자유발언을 제외한 실제 안건만 `agendaItems`로 적재하기 때문), 새 파싱 로직을 추가하지 않는다.
```

- [ ] **Step 2: `docs/rubric/CLAUDE.md`** §1.1 표에 "회의 단위 최소 표본" 행 바로 아래, 같은 표 스타일로 추가:

```markdown
| 부의된 안건 여부 | 해당 회의에 formally-tabled 안건이 1건 이상 있는가(5분자유발언 제외) | 안건이 전혀 없는 회의(예: 개회식)는 전체를 목록에서 제외한다(`backend/lib/queries/insights.ts`). |
```

- [ ] **Step 3: `harness.md`** 확인 후 필요시 수정

Run: `grep -n "카테고리\|committee.do\|본회의로 좁혀" "c:\Gen_AI\Geoje_City_Council\harness.md"`

결과가 있으면 해당 문구를 "먼저 late.do 1페이지만 시험 실행(page=1)해 결과를 확인 → drizzle-kit studio로 검수, 문제없으면 전체 페이지로 재실행"으로 교체한다. 결과가 없으면(옛 committee.do 체계를 이름으로 언급하는 부분이 없으면) 이 스텝은 변경 없이 스킵한다 — 없는 문구를 억지로 만들어 추가하지 않는다.

- [ ] **Step 4: 커밋**

```bash
cd "c:\Gen_AI\Geoje_City_Council"
git add CLAUDE.md docs/rubric/CLAUDE.md harness.md
git commit -m "docs: document late.do scraper source and agenda-item gate"
```

(Step 3에서 `harness.md`에 변경 사항이 없었다면 `git add`에서 그 파일은 자연히 diff 없이 스킵된다.)

---

### Task 7: 전체 검증 (테스트 스위트 + 라이브 스모크 테스트)

**Files:** 없음(검증만).

- [ ] **Step 1: 전체 테스트 스위트**

Run: `cd backend && npx vitest run`
Expected: 전부 통과, 에러 0건.

- [ ] **Step 2: 타입 체크**

Run: `cd backend && npx tsc --noEmit`
Expected: 에러 0건.

- [ ] **Step 3: 라이브 스모크 테스트 — `check-new-meetings` 로컬 실행**

`npm run dev`로 로컬 서버를 띄우고, 관리자 PIN으로 `POST /api/admin/check-new-meetings`를 호출(curl 또는 모바일 관리자 화면)해 실제로 late.do를 훑어 결과를 반환하는지 확인. 이미 DB에 있는 회의만 있다면 `newMeetings: []`가 빨리(1페이지 내) 반환되는지 확인 — 오래 걸리거나 에러가 나면 Task 1의 셀렉터를 재점검.

- [ ] **Step 4: `getInsightRows()` 결과 비교**

배포 전 로컬에서 `npx drizzle-kit studio`로 `agendaItems` 테이블을 확인해, `meetingId`가 없는(=0건) 회의가 몇 개인지 파악한 뒤, `/api/insights`(로컬 dev 서버)의 응답에서 해당 회의들이 실제로 빠졌는지 확인.

- [ ] **Step 5: 결과 기록**

문제없으면 이 태스크에 체크 완료 표시. 문제 발견 시 원인이 된 태스크로 돌아가 수정하고 그 태스크의 커밋을 새로 만든다(새 태스크를 추가하지 않는다).

---

### Task 8: 프로덕션 배포

**Files:** 없음(배포만).

- [ ] **Step 1: 백엔드 배포**

Run: `cd backend && npx vercel deploy --prod --yes`
Expected: `Deployment ... ready`, `backend-dun-nu-97.vercel.app`로 aliased.

- [ ] **Step 2: 배포 후 확인**

Run: `curl -s "https://backend-dun-nu-97.vercel.app/api/insights" | node -e "const rows=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('rows:', rows.length, 'meetings:', new Set(rows.map(r=>r.meetingTitle)).size)"`
Expected: 에러 없이 응답, 개회식류 회의가 빠진 만큼 회의 수가 이전보다 적거나 같음(배포 사이 신규 스크랩이 없었다면 정확히 그 차이만큼 감소).

- [ ] **Step 3: 결과 보고**

사용자에게 배포 완료와 함께 `getInsightRows()` 응답 회의/발언 수 변화를 간단히 보고한다. `check-new-meetings`/`run.ts`를 이용한 실제 전체 재스크랩(과거 회기 소급 수집 등)은 이 작업의 범위가 아니므로 별도로 필요 여부를 사용자에게 확인한다.
