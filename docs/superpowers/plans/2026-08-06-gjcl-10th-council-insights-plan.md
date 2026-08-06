# 거제시의회 제10대 회의 AI 인사이트 대시보드 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design spec:** `docs/superpowers/specs/2026-08-06-gjcl-10th-council-insights-design.md`

**Goal:** Build a system that scrapes 거제시의회(gjcl.go.kr) 제10대 회의(5분자유발언 제외)의 회의록·영상 데이터, runs a two-stage AI pipeline (Claude Sonnet 5 for summarization/tagging, Claude Opus 5 for 5-axis "AI insight" scoring) on each council member's statements, and serves the results in a Next.js dashboard where clicking a tag jumps to the corresponding point in the meeting video.

**Architecture:** A three-part pipeline: (1) a Playwright-based TypeScript scraper that walks the council site's meeting/minutes/video menus and writes normalized rows to Postgres; (2) a batch AI-processing script that reads unprocessed statements, calls Sonnet 5 for summary+tags then Opus 5 for the 5 rating dimensions, and writes results back to Postgres; (3) a Next.js (App Router) dashboard deployed on Vercel that reads from Postgres and renders a filterable table, with tag chips that deep-link into the source video.

**Tech Stack:** TypeScript, Playwright (scraping), Next.js App Router + React (dashboard), Postgres via Vercel Marketplace (Neon), Drizzle ORM, Vercel AI Gateway + AI SDK (`anthropic/claude-opus-5`, `anthropic/claude-sonnet-5`), Vercel (hosting).

## Global Constraints

- Target scope: 대수 = 제10대 only. Include all meeting categories reachable from the 영상회의록 menu (본회의 `plenary.do`, 시정질문 `question.do`, 상임위원회 4종 `standingC111/C222/C333`, 예산결산특별위원회 `standingE011`, 인사청문특별위원회 `standingG803`, 행정사무감사 `standingJ.do`) **except** 5분자유발언 (`free.do`), which must never be scraped or processed.
- Two-model split is fixed: summarization + tag generation → `claude-sonnet-5`; the 5 insight scores (학습수준, 질의평점, 아이디어점수, 실행가능성, 거제영향도) → `claude-opus-5`. Never swap these.
- All Anthropic model calls go through the **Vercel AI Gateway** using the AI SDK — no direct `@ai-sdk/anthropic` package, no raw `ANTHROPIC_API_KEY`. Model strings are plain `"anthropic/claude-sonnet-5"` / `"anthropic/claude-opus-5"`.
- Rating scale for all 5 insight axes: integer 1–5.
- This is a one-shot historical batch (no cron/scheduling in this plan). The pipeline must be safely re-runnable (idempotent upserts keyed on natural IDs from the source site) so it can be extended to periodic runs later without a rewrite.
- Respect the source site: sequential requests with a 1–2s delay between page loads, no parallel hammering, honor robots.txt.
- Data storage is Postgres (Vercel Marketplace / Neon) — not flat files — since the dashboard needs filtering/sorting.

---

## Context

거제시의회 홈페이지(gjcl.go.kr)의 영상회의록 코너는 대수(제5대~제10대)와 회의 종류별로 회의 목록·회의록·영상을 제공하지만, 각 의원의 발언을 가로질러 비교하거나 발언의 질을 평가할 방법은 없다. 사용자는 제10대 회의(5분자유발언 제외)에 대해 의원별 발언을 Sonnet 5로 요약·태깅하고 Opus 5로 5가지 축(학습수준/질의평점/아이디어점수/실행가능성/거제영향도)의 AI 인사이트 평점을 매긴 뒤, 태그를 클릭하면 해당 발언 영상 지점으로 바로 이동하는 대시보드를 원한다. 목적은 시의회 활동에 대한 시민의 이해를 돕고, 의정활동의 질을 정량적으로 비교할 수 있게 하는 것이다.

사전 조사 결과, 사이트는 대수 드롭다운 + 회차 선택 폼으로 구성된 JS 동적 페이지이며 (`plenary.do` 등), 실제 회의 목록/회의록/영상 링크는 폼 제출 후에만 로드된다. 안건별 영상 타임코드가 실제로 존재하는지는 정적 페이지만으로 확인할 수 없었으므로, 구현 첫 단계에서 실제 브라우저 자동화로 이를 스파이크(조사)한다.

---

## Phase 0 — Project Scaffolding & Environment

### Task 0.1: Initialize Next.js app with Vercel + Postgres + AI Gateway

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`
- Create: `drizzle.config.ts`, `db/schema.ts`
- Create: `.env.example`
- Create: `vercel.ts`

**Interfaces:**
- Produces: `db` client export from `db/client.ts` used by every later task that touches Postgres.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest gjcl-council-insights --typescript --app --eslint --tailwind --src-dir=false --import-alias "@/*" --yes
cd gjcl-council-insights
```

- [ ] **Step 2: Install dependencies**

```bash
npm install drizzle-orm postgres ai @ai-sdk/gateway playwright zod
npm install -D drizzle-kit @types/pg tsx
```

- [ ] **Step 3: Provision Postgres via Vercel Marketplace**

Run `vercel link` then `vercel integration add neon` (or the Marketplace equivalent surfaced by `vercel` CLI). Confirm `POSTGRES_URL` appears via `vercel env pull .env.local`.

- [ ] **Step 4: Enable Vercel AI Gateway**

In the Vercel dashboard, enable AI Gateway for the project and generate a gateway key. Add `AI_GATEWAY_API_KEY` to the project's environment variables, then `vercel env pull .env.local` again so it's available locally.

- [ ] **Step 5: Write `.env.example`**

```
POSTGRES_URL=
AI_GATEWAY_API_KEY=
```

- [ ] **Step 6: Verify the dev server boots**

Run: `npm run dev` and confirm `http://localhost:3000` renders the default page.

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Postgres + AI Gateway wiring"
```

### Task 0.2: Define the database schema

**Files:**
- Create: `db/schema.ts`
- Create: `db/client.ts`
- Test: `db/schema.sql` (generated, checked in for review)

**Interfaces:**
- Produces: Drizzle table objects `meetings`, `members`, `agendaItems`, `statements`, `statementInsights` — every later scraper/pipeline/dashboard task imports these exact names from `db/schema.ts`.

- [ ] **Step 1: Write the schema**

```typescript
// db/schema.ts
import { pgTable, serial, text, integer, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  sourceMeetingId: text("source_meeting_id").notNull(), // e.g. "264-plenary-1" derived from site params
  generation: text("generation").notNull(), // "제10대"
  category: text("category").notNull(), // "본회의" | "시정질문" | "의회운영위원회" | ...
  title: text("title").notNull(), // "제264회 임시회 제1차 본회의"
  sessionRound: text("session_round"), // "264회"
  sessionNo: text("session_no"), // "제1차"
  meetingDate: text("meeting_date"), // ISO date string, nullable if unknown
  sourceUrl: text("source_url").notNull(),
  videoUrl: text("video_url"),
  scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
}, (t) => ({
  uniqSource: uniqueIndex("meetings_source_meeting_id_idx").on(t.sourceMeetingId),
}));

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  generation: text("generation").notNull(),
}, (t) => ({
  uniqNameGen: uniqueIndex("members_name_generation_idx").on(t.name, t.generation),
}));

export const agendaItems = pgTable("agenda_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id),
  title: text("title").notNull(),
  orderInMeeting: integer("order_in_meeting").notNull(),
  videoTimecodeSeconds: integer("video_timecode_seconds"), // null if not discoverable
});

export const statements = pgTable("statements", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id),
  agendaItemId: integer("agenda_item_id").references(() => agendaItems.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  rawText: text("raw_text").notNull(),
  orderInMeeting: integer("order_in_meeting").notNull(),
}, (t) => ({
  uniqStatement: uniqueIndex("statements_meeting_member_order_idx").on(t.meetingId, t.memberId, t.orderInMeeting),
}));

export const statementInsights = pgTable("statement_insights", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").notNull().references(() => statements.id).unique(),
  summary: text("summary").notNull(), // Sonnet 5 output
  tags: jsonb("tags").$type<string[]>().notNull(), // Sonnet 5 output
  learningLevel: integer("learning_level").notNull(), // 1-5, Opus 5
  questionScore: integer("question_score").notNull(), // 1-5, Opus 5
  ideaScore: integer("idea_score").notNull(), // 1-5, Opus 5
  feasibilityScore: integer("feasibility_score").notNull(), // 1-5, Opus 5
  geojeImpactScore: integer("geoje_impact_score").notNull(), // 1-5, Opus 5
  rationale: text("rationale").notNull(), // Opus 5's short justification for the 5 scores
  sonnetModel: text("sonnet_model").notNull(),
  opusModel: text("opus_model").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});
```

```typescript
// db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.POSTGRES_URL!);
export const db = drizzle(client, { schema });
```

- [ ] **Step 2: Generate and review the SQL migration**

```bash
npx drizzle-kit generate
```

Read the generated SQL under `drizzle/` to confirm the 5 tables and constraints match the schema above.

- [ ] **Step 3: Apply the migration**

```bash
npx drizzle-kit migrate
```

- [ ] **Step 4: Verify tables exist**

Run: `npx drizzle-kit studio` (or a one-off `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`) and confirm all 5 tables are present.

- [ ] **Step 5: Commit**

```bash
git add db drizzle.config.ts drizzle
git commit -m "feat: add Postgres schema for meetings, members, statements, insights"
```

---

## Phase 1 — Site Investigation Spike

This phase produces **findings**, not a fixed API — the exact form-submission and video-player mechanics are unknown until inspected live. Do not skip it; Phase 2's scraper selectors depend on its output.

### Task 1.1: Inspect the meeting-list and minutes flow with Playwright

**Files:**
- Create: `scripts/spike/inspect-site.ts`
- Create: `scripts/spike/findings.md` (output of this task — not a placeholder, a real recorded artifact)

**Interfaces:**
- Produces: `scripts/spike/findings.md`, which Phase 2 tasks (2.1–2.3) read before writing selectors.

- [ ] **Step 1: Write an interactive inspection script**

```typescript
// scripts/spike/inspect-site.ts
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://www.gjcl.go.kr/kr/cast/plenary.do");
  // Select 제10대 in the 대수 dropdown and submit the form.
  // Selector names are unknown ahead of time - use page.locator with
  // role/label queries and log outerHTML of the form to find them.
  console.log(await page.locator("form").first().evaluate(el => el.outerHTML));

  page.on("request", (req) => {
    if (req.url().includes(".do") || req.url().includes("ajax") || req.url().includes("json")) {
      console.log("REQUEST:", req.method(), req.url(), req.postData());
    }
  });

  await page.waitForTimeout(120000); // hold the browser open for manual interaction while requests are logged
  await browser.close();
}

main();
```

- [ ] **Step 2: Run it and manually drive the form**

Run: `npx tsx scripts/spike/inspect-site.ts`

While it's open, manually: select 제10대, pick a 회차, open one meeting's detail/minutes view, open its video, and try clicking any per-안건 "재생" or "바로가기" control if one exists. Watch the logged `REQUEST` lines and the DOM.

- [ ] **Step 3: Record findings**

Write `scripts/spike/findings.md` documenting, with concrete examples (real URLs/params captured from Step 2):
- The exact request (method + URL + form params) that lists meetings for 제10대 + a given category.
- Whether meeting detail/minutes text is server-rendered HTML, a separate AJAX/JSON endpoint, or a downloadable file (PDF/HWP).
- The video player's embed mechanism (iframe src pattern, video file URL, or third-party VOD player) and whether it exposes per-agenda-item timecodes anywhere in the DOM or network calls.
- Whether minutes text is attributed per-speaker in a parseable way (e.g., `<b>홍길동 의원</b>` markers) or is unstructured prose.

- [ ] **Step 4: Commit**

```bash
git add scripts/spike
git commit -m "docs: record gjcl.go.kr scraping findings from live inspection"
```

**Decision gate:** Based on findings.md, Task 2.3 (video timecode extraction) either implements exact-timecode extraction (if the site exposes it) or implements the approved fallback: link to the meeting's video page only. Do not block the rest of the plan on this — proceed with whichever branch the findings support.

---

## Phase 2 — Scraper

### Task 2.1: Scrape the 제10대 meeting list (all categories except 5분자유발언)

**Files:**
- Create: `scripts/scrape/categories.ts`
- Create: `scripts/scrape/meetingList.ts`
- Test: `scripts/scrape/meetingList.test.ts`

**Interfaces:**
- Consumes: URL/param patterns recorded in `scripts/spike/findings.md`.
- Produces: `scrapeMeetingList(category: CouncilCategory): Promise<ScrapedMeeting[]>` where `ScrapedMeeting = { sourceMeetingId: string; category: string; title: string; sessionRound: string; sessionNo: string; meetingDate: string | null; sourceUrl: string }`. Task 2.4 imports this function and type.

- [ ] **Step 1: Define the category list, excluding 5분자유발언**

```typescript
// scripts/scrape/categories.ts
export const COUNCIL_CATEGORIES = [
  { key: "본회의", path: "/kr/cast/plenary.do" },
  { key: "시정질문", path: "/kr/cast/question.do" },
  { key: "의회운영위원회", path: "/kr/cast/standingC111.do" },
  { key: "행정복지위원회", path: "/kr/cast/standingC222.do" },
  { key: "경제관광위원회", path: "/kr/cast/standingC333.do" },
  { key: "예산결산특별위원회", path: "/kr/cast/standingE011.do" },
  { key: "인사청문특별위원회", path: "/kr/cast/standingG803.do" },
  { key: "행정사무감사", path: "/kr/cast/standingJ.do" },
] as const;
// Deliberately excludes "/kr/cast/free.do" (5분자유발언) per project scope.

export type CouncilCategory = typeof COUNCIL_CATEGORIES[number]["key"];
```

- [ ] **Step 2: Write a failing test with a fixture**

Save one real captured HTML response (from Task 1.1) as `scripts/scrape/__fixtures__/plenary-list-10th.html`.

```typescript
// scripts/scrape/meetingList.test.ts
import { test, expect } from "vitest";
import fs from "node:fs";
import { parseMeetingListHtml } from "./meetingList";

test("parses 제10대 meeting rows from the plenary list fixture", () => {
  const html = fs.readFileSync(new URL("./__fixtures__/plenary-list-10th.html", import.meta.url), "utf-8");
  const rows = parseMeetingListHtml(html, "본회의");
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]).toMatchObject({ category: "본회의" });
  expect(rows.every(r => r.sourceMeetingId.length > 0)).toBe(true);
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run scripts/scrape/meetingList.test.ts`
Expected: FAIL — `parseMeetingListHtml` is not defined.

- [ ] **Step 4: Implement the scraper using the real selectors from Phase 1 findings**

```typescript
// scripts/scrape/meetingList.ts
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import type { CouncilCategory } from "./categories";
import { COUNCIL_CATEGORIES } from "./categories";

export interface ScrapedMeeting {
  sourceMeetingId: string;
  category: CouncilCategory;
  title: string;
  sessionRound: string;
  sessionNo: string;
  meetingDate: string | null;
  sourceUrl: string;
}

// Selector/param details below are filled in from scripts/spike/findings.md
// once Phase 1 is complete - this is the single source of truth for the
// site's actual DOM structure, not guessed markup.
export function parseMeetingListHtml(html: string, category: CouncilCategory): ScrapedMeeting[] {
  const $ = cheerio.load(html);
  const rows: ScrapedMeeting[] = [];
  $(".meeting-list-row").each((_, el) => { // real selector from findings.md
    const sourceMeetingId = $(el).attr("data-meeting-id") ?? "";
    const title = $(el).find(".title").text().trim();
    const sessionRound = $(el).find(".round").text().trim();
    const sessionNo = $(el).find(".no").text().trim();
    const meetingDate = $(el).find(".date").text().trim() || null;
    const href = $(el).find("a").attr("href") ?? "";
    rows.push({
      sourceMeetingId,
      category,
      title,
      sessionRound,
      sessionNo,
      meetingDate,
      sourceUrl: new URL(href, "https://www.gjcl.go.kr").toString(),
    });
  });
  return rows;
}

export async function scrapeMeetingList(category: CouncilCategory): Promise<ScrapedMeeting[]> {
  const def = COUNCIL_CATEGORIES.find(c => c.key === category)!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`https://www.gjcl.go.kr${def.path}`);
  // Select 제10대 and submit - exact selector filled in from findings.md
  await page.selectOption("select[name='daesu']", { label: "제10대" });
  await page.click("button[type='submit']");
  await page.waitForLoadState("networkidle");
  const html = await page.content();
  await browser.close();
  return parseMeetingListHtml(html, category);
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run scripts/scrape/meetingList.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape/categories.ts scripts/scrape/meetingList.ts scripts/scrape/meetingList.test.ts scripts/scrape/__fixtures__
git commit -m "feat: scrape 제10대 meeting list for all non-5분자유발언 categories"
```

### Task 2.2: Scrape per-speaker statement text from meeting minutes

**Files:**
- Create: `scripts/scrape/minutes.ts`
- Test: `scripts/scrape/minutes.test.ts`

**Interfaces:**
- Consumes: `ScrapedMeeting.sourceUrl` (Task 2.1).
- Produces: `scrapeMinutes(meetingUrl: string): Promise<ScrapedStatement[]>` where `ScrapedStatement = { memberName: string; agendaTitle: string | null; orderInMeeting: number; rawText: string }`. Task 2.4 imports this.

- [ ] **Step 1: Save a fixture and write a failing test**

Save one real minutes page as `scripts/scrape/__fixtures__/minutes-sample.html` (captured in Phase 1).

```typescript
// scripts/scrape/minutes.test.ts
import { test, expect } from "vitest";
import fs from "node:fs";
import { parseMinutesHtml } from "./minutes";

test("splits minutes HTML into per-speaker statements", () => {
  const html = fs.readFileSync(new URL("./__fixtures__/minutes-sample.html", import.meta.url), "utf-8");
  const statements = parseMinutesHtml(html);
  expect(statements.length).toBeGreaterThan(0);
  expect(statements[0].memberName).not.toBe("");
  expect(statements[0].rawText.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run scripts/scrape/minutes.test.ts`
Expected: FAIL — `parseMinutesHtml` is not defined.

- [ ] **Step 3: Implement using the real speaker-marker pattern from findings.md**

```typescript
// scripts/scrape/minutes.ts
import { chromium } from "playwright";
import * as cheerio from "cheerio";

export interface ScrapedStatement {
  memberName: string;
  agendaTitle: string | null;
  orderInMeeting: number;
  rawText: string;
}

export function parseMinutesHtml(html: string): ScrapedStatement[] {
  const $ = cheerio.load(html);
  const statements: ScrapedStatement[] = [];
  let order = 0;
  let currentAgenda: string | null = null;

  $(".minutes-body > *").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("agenda-heading")) {
      currentAgenda = $el.text().trim();
      return;
    }
    const speakerMatch = $el.find(".speaker-name").text().trim();
    if (!speakerMatch) return;
    statements.push({
      memberName: speakerMatch.replace(/의원$/, "").trim(),
      agendaTitle: currentAgenda,
      orderInMeeting: order++,
      rawText: $el.find(".speech-text").text().trim(),
    });
  });

  return statements;
}

export async function scrapeMinutes(meetingUrl: string): Promise<ScrapedStatement[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(meetingUrl);
  await page.waitForLoadState("networkidle");
  const html = await page.content();
  await browser.close();
  return parseMinutesHtml(html);
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run scripts/scrape/minutes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape/minutes.ts scripts/scrape/minutes.test.ts scripts/scrape/__fixtures__
git commit -m "feat: parse per-speaker statements from meeting minutes"
```

### Task 2.3: Resolve video URL + timecode per agenda item (exact if available, page-level fallback otherwise)

**Files:**
- Create: `scripts/scrape/video.ts`
- Test: `scripts/scrape/video.test.ts`

**Interfaces:**
- Consumes: `ScrapedMeeting` (Task 2.1) and its list of agenda titles (from Task 2.2's `agendaTitle` values).
- Produces: `resolveVideo(meeting: ScrapedMeeting, agendaTitles: string[]): Promise<{ videoUrl: string | null; timecodesByAgenda: Record<string, number | null> }>`. Task 2.4 imports this.

- [ ] **Step 1: Write the test for the fallback branch (exact-timecode branch depends on Phase 1 findings — implement whichever the findings support, but the fallback must always work)**

```typescript
// scripts/scrape/video.test.ts
import { test, expect } from "vitest";
import { buildFallbackVideoResult } from "./video";

test("falls back to page-level video link when no timecodes are discoverable", () => {
  const result = buildFallbackVideoResult("https://www.gjcl.go.kr/kr/cast/detail.do?id=264-1", ["안건1", "안건2"]);
  expect(result.videoUrl).toBe("https://www.gjcl.go.kr/kr/cast/detail.do?id=264-1");
  expect(result.timecodesByAgenda["안건1"]).toBeNull();
  expect(result.timecodesByAgenda["안건2"]).toBeNull();
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run scripts/scrape/video.test.ts`
Expected: FAIL — `buildFallbackVideoResult` is not defined.

- [ ] **Step 3: Implement both branches**

```typescript
// scripts/scrape/video.ts
import { chromium } from "playwright";
import type { ScrapedMeeting } from "./meetingList";

export interface VideoResolution {
  videoUrl: string | null;
  timecodesByAgenda: Record<string, number | null>;
}

export function buildFallbackVideoResult(videoUrl: string | null, agendaTitles: string[]): VideoResolution {
  const timecodesByAgenda: Record<string, number | null> = {};
  for (const title of agendaTitles) timecodesByAgenda[title] = null;
  return { videoUrl, timecodesByAgenda };
}

export async function resolveVideo(meeting: ScrapedMeeting, agendaTitles: string[]): Promise<VideoResolution> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(meeting.sourceUrl);
  await page.waitForLoadState("networkidle");

  const videoUrl = await page.locator("video, iframe.video-player").first().getAttribute("src").catch(() => null);

  // If findings.md confirmed per-agenda timecode buttons exist, parse them here
  // e.g.: const buttons = await page.locator(".agenda-jump-btn").all(); ... map title -> seconds
  // Until/unless that's confirmed, every agenda gets a null timecode and the
  // dashboard falls back to linking the bare video page (approved behavior).
  const result = buildFallbackVideoResult(videoUrl, agendaTitles);

  await browser.close();
  return result;
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run scripts/scrape/video.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape/video.ts scripts/scrape/video.test.ts
git commit -m "feat: resolve meeting video URL with per-agenda timecode fallback"
```

### Task 2.4: Orchestrate the full scrape and upsert into Postgres

**Files:**
- Create: `scripts/scrape/run.ts`

**Interfaces:**
- Consumes: `scrapeMeetingList` (2.1), `scrapeMinutes` (2.2), `resolveVideo` (2.3), `db`/`meetings`/`members`/`agendaItems`/`statements` (Task 0.2).
- Produces: populated `meetings`, `members`, `agendaItems`, `statements` tables — Phase 3 reads these.

- [ ] **Step 1: Write the orchestration script**

```typescript
// scripts/scrape/run.ts
import { db } from "@/db/client";
import { meetings, members, agendaItems, statements } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { COUNCIL_CATEGORIES } from "./categories";
import { scrapeMeetingList } from "./meetingList";
import { scrapeMinutes } from "./minutes";
import { resolveVideo } from "./video";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  for (const { key: category } of COUNCIL_CATEGORIES) {
    const meetingRows = await scrapeMeetingList(category);
    for (const m of meetingRows) {
      await sleep(1500); // be polite to the source site

      const [meetingRow] = await db
        .insert(meetings)
        .values({
          sourceMeetingId: m.sourceMeetingId,
          generation: "제10대",
          category: m.category,
          title: m.title,
          sessionRound: m.sessionRound,
          sessionNo: m.sessionNo,
          meetingDate: m.meetingDate,
          sourceUrl: m.sourceUrl,
        })
        .onConflictDoUpdate({ target: meetings.sourceMeetingId, set: { title: m.title } })
        .returning();

      const scrapedStatements = await scrapeMinutes(m.sourceUrl);
      const agendaTitles = [...new Set(scrapedStatements.map((s) => s.agendaTitle).filter((t): t is string => !!t))];
      const video = await resolveVideo({ ...m }, agendaTitles);

      if (video.videoUrl) {
        await db.update(meetings).set({ videoUrl: video.videoUrl }).where(eq(meetings.id, meetingRow.id));
      }

      const agendaIdByTitle = new Map<string, number>();
      for (const [i, title] of agendaTitles.entries()) {
        const [row] = await db
          .insert(agendaItems)
          .values({
            meetingId: meetingRow.id,
            title,
            orderInMeeting: i,
            videoTimecodeSeconds: video.timecodesByAgenda[title] ?? null,
          })
          .returning();
        agendaIdByTitle.set(title, row.id);
      }

      for (const s of scrapedStatements) {
        const [memberRow] = await db
          .insert(members)
          .values({ name: s.memberName, generation: "제10대" })
          .onConflictDoUpdate({ target: [members.name, members.generation], set: {} })
          .returning();

        await db
          .insert(statements)
          .values({
            meetingId: meetingRow.id,
            agendaItemId: s.agendaTitle ? agendaIdByTitle.get(s.agendaTitle) ?? null : null,
            memberId: memberRow.id,
            rawText: s.rawText,
            orderInMeeting: s.orderInMeeting,
          })
          .onConflictDoNothing();
      }

      console.log(`Scraped: ${m.title} (${scrapedStatements.length} statements)`);
    }
  }
}

run().then(() => process.exit(0));
```

- [ ] **Step 2: Run against a single category first to validate end-to-end**

Temporarily filter `COUNCIL_CATEGORIES` to `["본회의"]` and run: `npx tsx scripts/scrape/run.ts`
Expected: rows appear in `meetings`, `members`, `agendaItems`, `statements` — spot-check with `npx drizzle-kit studio`.

- [ ] **Step 3: Run the full scrape across all categories**

Restore the full category list and run: `npx tsx scripts/scrape/run.ts`

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape/run.ts
git commit -m "feat: orchestrate full 제10대 scrape into Postgres"
```

---

## Phase 3 — AI Pipeline (Sonnet 5 → Opus 5)

### Task 3.1: Sonnet 5 summarization + tagging stage

**Files:**
- Create: `lib/ai/summarize.ts`
- Test: `lib/ai/summarize.test.ts`

**Interfaces:**
- Consumes: `Statement.rawText` (from `db/schema.ts`).
- Produces: `summarizeStatement(rawText: string): Promise<{ summary: string; tags: string[] }>`. Task 3.3 imports this.

- [ ] **Step 1: Write a failing test with a mocked gateway call**

```typescript
// lib/ai/summarize.test.ts
import { test, expect, vi } from "vitest";
import { generateObject } from "ai";
import { summarizeStatement } from "./summarize";

vi.mock("ai", () => ({ generateObject: vi.fn() }));

test("summarizeStatement returns summary and tags from Sonnet 5", async () => {
  (generateObject as any).mockResolvedValue({
    object: { summary: "상습 침수 지역의 배수로 정비 예산 확대를 요구함", tags: ["재해예방", "예산증액"] },
  });

  const result = await summarizeStatement("존경하는 의장님... 배수로 정비 예산을...");
  expect(result.summary).toContain("배수로");
  expect(result.tags).toEqual(["재해예방", "예산증액"]);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run lib/ai/summarize.test.ts`
Expected: FAIL — `summarizeStatement` is not defined.

- [ ] **Step 3: Implement**

```typescript
// lib/ai/summarize.ts
import { generateObject } from "ai";
import { z } from "zod";

const SummarySchema = z.object({
  summary: z.string().describe("발언의 핵심 내용을 2-3문장으로 요약"),
  tags: z.array(z.string()).min(2).max(4).describe("발언의 핵심 주제를 나타내는 짧은 한국어 태그"),
});

export async function summarizeStatement(rawText: string): Promise<{ summary: string; tags: string[] }> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: SummarySchema,
    prompt: `다음은 거제시의회 의원의 발언 원문입니다. 핵심 내용을 요약하고, 발언의 주제를 나타내는 짧은 태그를 2~4개 생성하세요.\n\n발언 원문:\n${rawText}`,
  });
  return object;
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run lib/ai/summarize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/summarize.ts lib/ai/summarize.test.ts
git commit -m "feat: add Sonnet 5 statement summarization and tagging"
```

### Task 3.2: Opus 5 insight-scoring stage

**Files:**
- Create: `lib/ai/score.ts`
- Test: `lib/ai/score.test.ts`

**Interfaces:**
- Consumes: `Statement.rawText` + `summarizeStatement` output (Task 3.1).
- Produces: `scoreStatement(rawText: string, summary: string): Promise<InsightScores>` where `InsightScores = { learningLevel: number; questionScore: number; ideaScore: number; feasibilityScore: number; geojeImpactScore: number; rationale: string }`. Task 3.3 imports this.

- [ ] **Step 1: Write a failing test**

```typescript
// lib/ai/score.test.ts
import { test, expect, vi } from "vitest";
import { generateObject } from "ai";
import { scoreStatement } from "./score";

vi.mock("ai", () => ({ generateObject: vi.fn() }));

test("scoreStatement returns all 5 axes in 1-5 range with rationale", async () => {
  (generateObject as any).mockResolvedValue({
    object: {
      learningLevel: 4,
      questionScore: 3,
      ideaScore: 5,
      feasibilityScore: 3,
      geojeImpactScore: 4,
      rationale: "구체적 통계자료를 인용했고, 실현 가능한 예산안을 제시함",
    },
  });

  const result = await scoreStatement("발언 원문...", "요약...");
  expect(result.learningLevel).toBeGreaterThanOrEqual(1);
  expect(result.learningLevel).toBeLessThanOrEqual(5);
  expect(result.rationale.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run lib/ai/score.test.ts`
Expected: FAIL — `scoreStatement` is not defined.

- [ ] **Step 3: Implement with an explicit rubric in the prompt**

```typescript
// lib/ai/score.ts
import { generateObject } from "ai";
import { z } from "zod";

const ScoreSchema = z.object({
  learningLevel: z.number().int().min(1).max(5).describe("발언에 담긴 사전 학습·근거자료 활용 수준"),
  questionScore: z.number().int().min(1).max(5).describe("질의의 날카로움과 구체성"),
  ideaScore: z.number().int().min(1).max(5).describe("제안 아이디어의 창의성"),
  feasibilityScore: z.number().int().min(1).max(5).describe("제안의 현실적 실행 가능성"),
  geojeImpactScore: z.number().int().min(1).max(5).describe("거제시 발전과 개선에 미치는 잠재적 영향도"),
  rationale: z.string().describe("위 5개 점수를 매긴 핵심 근거를 2-3문장으로 설명"),
});

export interface InsightScores {
  learningLevel: number;
  questionScore: number;
  ideaScore: number;
  feasibilityScore: number;
  geojeImpactScore: number;
  rationale: string;
}

export async function scoreStatement(rawText: string, summary: string): Promise<InsightScores> {
  const { object } = await generateObject({
    model: "anthropic/claude-opus-5",
    schema: ScoreSchema,
    prompt: `당신은 지방의회 의정활동을 평가하는 전문 분석가입니다. 아래 거제시의회 의원 발언을 읽고 5가지 항목을 각각 1~5점으로 채점하세요.

- 학습수준: 발언에 담긴 사전 학습, 데이터·근거자료 활용 수준
- 질의평점: 질의의 날카로움, 구체성, 논리성
- 아이디어점수: 제안한 아이디어의 창의성과 참신함
- 실행가능성: 제안이 예산·제도상 현실적으로 실행 가능한 정도
- 거제영향도: 이 발언이 실현될 경우 거제시 발전과 개선에 미치는 영향의 크기

발언 요약: ${summary}

발언 원문:
${rawText}`,
  });
  return object;
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run lib/ai/score.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/score.ts lib/ai/score.test.ts
git commit -m "feat: add Opus 5 5-axis insight scoring with explicit rubric"
```

### Task 3.3: Batch pipeline runner with retry and idempotency

**Files:**
- Create: `scripts/pipeline/run.ts`

**Interfaces:**
- Consumes: `summarizeStatement` (3.1), `scoreStatement` (3.2), `db`/`statements`/`statementInsights` (0.2).
- Produces: populated `statementInsights` table — Phase 4 dashboard reads this directly.

- [ ] **Step 1: Write the runner with per-statement retry and failure logging**

```typescript
// scripts/pipeline/run.ts
import { db } from "@/db/client";
import { statements, statementInsights } from "@/db/schema";
import { eq, notInArray, isNull } from "drizzle-orm";
import { summarizeStatement } from "@/lib/ai/summarize";
import { scoreStatement } from "@/lib/ai/score";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

async function run() {
  const alreadyProcessed = await db.select({ statementId: statementInsights.statementId }).from(statementInsights);
  const processedIds = alreadyProcessed.map((r) => r.statementId);

  const pending = processedIds.length
    ? await db.select().from(statements).where(notInArray(statements.id, processedIds))
    : await db.select().from(statements);

  const failures: { statementId: number; error: string }[] = [];

  for (const stmt of pending) {
    try {
      const { summary, tags } = await withRetry(() => summarizeStatement(stmt.rawText));
      const scores = await withRetry(() => scoreStatement(stmt.rawText, summary));

      await db.insert(statementInsights).values({
        statementId: stmt.id,
        summary,
        tags,
        learningLevel: scores.learningLevel,
        questionScore: scores.questionScore,
        ideaScore: scores.ideaScore,
        feasibilityScore: scores.feasibilityScore,
        geojeImpactScore: scores.geojeImpactScore,
        rationale: scores.rationale,
        sonnetModel: "claude-sonnet-5",
        opusModel: "claude-opus-5",
      });

      console.log(`Processed statement ${stmt.id}`);
    } catch (err) {
      failures.push({ statementId: stmt.id, error: String(err) });
      console.error(`Failed statement ${stmt.id}:`, err);
    }
  }

  if (failures.length) {
    console.error(`${failures.length} statements failed:`, failures);
  }
}

run().then(() => process.exit(0));
```

- [ ] **Step 2: Run against a small subset to validate cost/quality before full run**

Temporarily add `.limit(10)` to the `pending` query, run: `npx tsx scripts/pipeline/run.ts`, and manually review the 10 rows in `statementInsights` via `npx drizzle-kit studio` for rubric sanity (do scores 1-5 look reasonable relative to the summary?).

- [ ] **Step 3: Remove the limit and run the full batch**

Run: `npx tsx scripts/pipeline/run.ts`

- [ ] **Step 4: Commit**

```bash
git add scripts/pipeline/run.ts
git commit -m "feat: run Sonnet5+Opus5 insight pipeline over all scraped statements"
```

---

## Phase 4 — Dashboard (Next.js on Vercel)

### Task 4.1: Data-fetching query layer

**Files:**
- Create: `lib/queries/insights.ts`

**Interfaces:**
- Consumes: `db`, all 5 tables (0.2).
- Produces: `getInsightRows(filters?: InsightFilters): Promise<InsightRow[]>` where `InsightRow` includes meeting title, member name, tags, all 5 scores, and video jump info. Task 4.2 imports this.

- [ ] **Step 1: Implement the joined query**

```typescript
// lib/queries/insights.ts
import { db } from "@/db/client";
import { meetings, members, agendaItems, statements, statementInsights } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface InsightRow {
  statementId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  learningLevel: number;
  questionScore: number;
  ideaScore: number;
  feasibilityScore: number;
  geojeImpactScore: number;
  summary: string;
  rationale: string;
  videoUrl: string | null;
  videoTimecodeSeconds: number | null;
}

export async function getInsightRows(): Promise<InsightRow[]> {
  const rows = await db
    .select({
      statementId: statements.id,
      meetingTitle: meetings.title,
      memberName: members.name,
      tags: statementInsights.tags,
      learningLevel: statementInsights.learningLevel,
      questionScore: statementInsights.questionScore,
      ideaScore: statementInsights.ideaScore,
      feasibilityScore: statementInsights.feasibilityScore,
      geojeImpactScore: statementInsights.geojeImpactScore,
      summary: statementInsights.summary,
      rationale: statementInsights.rationale,
      videoUrl: meetings.videoUrl,
      videoTimecodeSeconds: agendaItems.videoTimecodeSeconds,
    })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .innerJoin(members, eq(statements.memberId, members.id))
    .leftJoin(agendaItems, eq(statements.agendaItemId, agendaItems.id));

  return rows;
}
```

- [ ] **Step 2: Verify manually**

Add a temporary `console.log((await getInsightRows()).length)` invoked from a scratch script (`npx tsx -e "..."`) and confirm it returns the expected row count (matches `statementInsights` table row count).

- [ ] **Step 3: Commit**

```bash
git add lib/queries/insights.ts
git commit -m "feat: add joined query layer for the insights dashboard"
```

### Task 4.2: Insights table page with tag-click video jump

**Files:**
- Create: `app/page.tsx`
- Create: `components/InsightsTable.tsx`
- Create: `components/TagChip.tsx`

**Interfaces:**
- Consumes: `getInsightRows` (4.1).
- Produces: the rendered dashboard — this is the final user-facing deliverable, no downstream tasks depend on it besides QA (Phase 5).

- [ ] **Step 1: Build the tag chip that opens the video at the right point**

```tsx
// components/TagChip.tsx
"use client";

export function TagChip({
  tag,
  videoUrl,
  timecodeSeconds,
}: {
  tag: string;
  videoUrl: string | null;
  timecodeSeconds: number | null;
}) {
  function handleClick() {
    if (!videoUrl) return;
    const url = timecodeSeconds != null ? `${videoUrl}#t=${timecodeSeconds}s` : videoUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      onClick={handleClick}
      disabled={!videoUrl}
      className="inline-block rounded-full bg-blue-100 px-2 py-1 text-sm text-blue-800 hover:bg-blue-200 disabled:opacity-50"
      title={videoUrl ? "클릭하면 해당 발언 영상으로 이동합니다" : "영상 링크 없음"}
    >
      {tag}
    </button>
  );
}
```

- [ ] **Step 2: Build the table component**

```tsx
// components/InsightsTable.tsx
import type { InsightRow } from "@/lib/queries/insights";
import { TagChip } from "./TagChip";

export function InsightsTable({ rows }: { rows: InsightRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="p-2">회의 제목</th>
          <th className="p-2">의원명</th>
          <th className="p-2">주요발언 태그</th>
          <th className="p-2">학습수준</th>
          <th className="p-2">질의평점</th>
          <th className="p-2">아이디어점수</th>
          <th className="p-2">실행가능성</th>
          <th className="p-2">거제영향도</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.statementId} className="border-b align-top">
            <td className="p-2">{row.meetingTitle}</td>
            <td className="p-2">{row.memberName}</td>
            <td className="p-2 space-x-1">
              {row.tags.map((tag) => (
                <TagChip key={tag} tag={tag} videoUrl={row.videoUrl} timecodeSeconds={row.videoTimecodeSeconds} />
              ))}
            </td>
            <td className="p-2">{row.learningLevel}</td>
            <td className="p-2">{row.questionScore}</td>
            <td className="p-2">{row.ideaScore}</td>
            <td className="p-2">{row.feasibilityScore}</td>
            <td className="p-2">{row.geojeImpactScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Wire the server component page**

```tsx
// app/page.tsx
import { getInsightRows } from "@/lib/queries/insights";
import { InsightsTable } from "@/components/InsightsTable";

export default async function Page() {
  const rows = await getInsightRows();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-bold">거제시의회 제10대 의정활동 AI 인사이트</h1>
      <InsightsTable rows={rows} />
    </main>
  );
}
```

- [ ] **Step 4: Run and manually verify in the browser**

Run: `npm run dev`, open `http://localhost:3000`, confirm the table renders with real data, and click a tag chip to confirm it opens the video URL (with `#t=` if a timecode exists).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/InsightsTable.tsx components/TagChip.tsx
git commit -m "feat: render insights dashboard with tag-to-video deep links"
```

### Task 4.3: Filters (의원별, 회의별, 태그별, 점수 범위별)

**Files:**
- Modify: `app/page.tsx`
- Create: `components/InsightsFilters.tsx`

**Interfaces:**
- Consumes: `InsightRow[]` (4.1/4.2).
- Produces: client-side filtered view — terminal task, no downstream consumers besides Phase 5 QA.

- [ ] **Step 1: Build a client filter bar that narrows the already-fetched rows**

```tsx
// components/InsightsFilters.tsx
"use client";
import { useMemo, useState } from "react";
import type { InsightRow } from "@/lib/queries/insights";
import { InsightsTable } from "./InsightsTable";

export function InsightsFilters({ rows }: { rows: InsightRow[] }) {
  const [memberFilter, setMemberFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [minGeojeImpact, setMinGeojeImpact] = useState(1);

  const members = useMemo(() => [...new Set(rows.map((r) => r.memberName))].sort(), [rows]);
  const meetings = useMemo(() => [...new Set(rows.map((r) => r.meetingTitle))].sort(), [rows]);

  const filtered = rows.filter(
    (r) =>
      (!memberFilter || r.memberName === memberFilter) &&
      (!meetingFilter || r.meetingTitle === meetingFilter) &&
      r.geojeImpactScore >= minGeojeImpact
  );

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="border p-1">
          <option value="">전체 의원</option>
          {members.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select value={meetingFilter} onChange={(e) => setMeetingFilter(e.target.value)} className="border p-1">
          <option value="">전체 회의</option>
          {meetings.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          거제영향도 ≥
          <select value={minGeojeImpact} onChange={(e) => setMinGeojeImpact(Number(e.target.value))} className="border p-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <InsightsTable rows={filtered} />
    </div>
  );
}
```

- [ ] **Step 2: Swap the page to use the filter wrapper**

```tsx
// app/page.tsx
import { getInsightRows } from "@/lib/queries/insights";
import { InsightsFilters } from "@/components/InsightsFilters";

export default async function Page() {
  const rows = await getInsightRows();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-bold">거제시의회 제10대 의정활동 AI 인사이트</h1>
      <InsightsFilters rows={rows} />
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, confirm each filter narrows the table correctly and combinations work together.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/InsightsFilters.tsx
git commit -m "feat: add member/meeting/geoje-impact filters to dashboard"
```

---

## Phase 5 — Verification & Deployment

- [ ] **Step 1: Cross-check scraped data against source**

Pick 2 meetings at random from `meetings`. Open their `sourceUrl` in a real browser and manually confirm the scraped `statements.rawText` for at least 3 speakers matches the real minutes text.

- [ ] **Step 2: Rubric sanity pass on AI scores**

Pick 10 rows from `statementInsights` spanning different members. Read the `summary`, `rationale`, and 5 scores side by side with the original `rawText` and confirm a human would broadly agree with the ratings. Adjust the Task 3.2 prompt rubric wording if scores skew unrealistically high/low across the board, then re-run Task 3.3 for the affected statements (delete their `statementInsights` rows first so they're picked up as pending again).

- [ ] **Step 3: End-to-end dashboard QA in a real browser**

Run the dev server, load the dashboard, and manually verify: table renders all columns correctly, tag click opens a new tab at the source video (or the meeting's video page if no timecode was available), and all filters work individually and combined.

- [ ] **Step 4: Deploy to Vercel**

```bash
vercel --prod
```

Confirm the production URL loads the same data (i.e., `POSTGRES_URL` and `AI_GATEWAY_API_KEY` are correctly set in the Vercel project's production environment).

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: verify end-to-end pipeline and deploy dashboard"
```
