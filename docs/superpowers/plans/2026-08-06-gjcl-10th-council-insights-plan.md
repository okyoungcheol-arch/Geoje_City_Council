# 거제시의회 제10대 회의 AI 인사이트 앱 — Implementation Plan (v2, mobile)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design spec:** `docs/superpowers/specs/2026-08-06-gjcl-10th-council-insights-design.md`
> **Supersedes:** the original Next.js-dashboard-with-video-jump plan. Video scraping/timestamp tasks are dropped entirely; the dashboard is replaced by a React Native (Expo) mobile app backed by a Next.js API.

**Goal:** Build a system that scrapes 거제시의회(gjcl.go.kr) 제10대 회의(5분자유발언 제외) 회의록 텍스트, runs a two-stage AI pipeline (Claude Sonnet 5 for summarization/tagging, Claude Opus 5 for 5-axis "AI insight" scoring) on each council member's statements, exposes the results via a Next.js API, and renders them in a React Native (Expo) mobile app where tapping a tag opens the statement's full minutes text.

**Architecture:** Two independent folders in this repo: `backend/` (Next.js API-only app, Vercel-deployed) owns the Playwright scraper, the Postgres schema, the Sonnet5→Opus5 AI pipeline, and a `/api/insights` REST endpoint; `mobile/` (Expo/React Native app) calls that API and renders a filterable list with a tag-tap-to-detail flow. No video scraping, playback, or timestamp linking anywhere in this system.

**Tech Stack:** TypeScript throughout. Backend: Next.js App Router (API routes only), Playwright, Postgres via Vercel Marketplace (Neon), Drizzle ORM, Vercel AI Gateway + AI SDK (`anthropic/claude-opus-5`, `anthropic/claude-sonnet-5`), Vercel hosting. Mobile: Expo + Expo Router, React Native, EAS Build.

## Global Constraints

- Target scope: 대수 = 제10대 only. Include all meeting categories reachable from the 영상회의록 menu (본회의 `plenary.do`, 시정질문 `question.do`, 상임위원회 4종 `standingC111/C222/C333`, 예산결산특별위원회 `standingE011`, 인사청문특별위원회 `standingG803`, 행정사무감사 `standingJ.do`) **except** 5분자유발언 (`free.do`), which must never be scraped or processed.
- **No video anywhere.** Do not scrape video URLs, do not add video/timecode columns, do not build a video player or deep link. The scraper only ever collects meeting metadata and minutes text.
- Two-model split is fixed: summarization + tag generation → `claude-sonnet-5`; the 5 insight scores (학습수준, 질의평점, 아이디어점수, 실행가능성, 거제영향도) → `claude-opus-5`. Never swap these.
- All Anthropic model calls go through the **Vercel AI Gateway** using the AI SDK — no direct `@ai-sdk/anthropic` package, no raw `ANTHROPIC_API_KEY`. Model strings are plain `"anthropic/claude-sonnet-5"` / `"anthropic/claude-opus-5"`.
- Gateway auth is **OIDC by default**: `vercel link` + `vercel env pull` provisions a `VERCEL_OIDC_TOKEN` automatically, which the `ai` package picks up with zero extra config. Do not manually generate an `AI_GATEWAY_API_KEY` unless OIDC is unavailable.
- Rating scale for all 5 insight axes: integer 1–5.
- This is a one-shot historical batch (no cron/scheduling in this plan). The pipeline must be safely re-runnable (idempotent upserts keyed on natural IDs from the source site).
- Respect the source site: sequential requests with a 1–2s delay between page loads, no parallel hammering, honor robots.txt.
- Data storage is Postgres (Vercel Marketplace / Neon) via `@neondatabase/serverless` + `drizzle-orm/neon-http`, env var `DATABASE_URL`.
- `backend/` and `mobile/` are separate npm projects (each with their own `package.json`), not a single merged app. The mobile app never imports backend code directly — it only calls the HTTP API.

---

## Context

거제시의회 홈페이지(gjcl.go.kr)의 영상회의록 코너는 대수·회의 종류별로 회의 목록·회의록·영상을 제공하지만, 의원별 발언을 가로질러 비교하거나 발언의 질을 평가할 방법이 없다. 사용자는 제10대 회의(5분자유발언 제외)에 대해 의원별 발언(회의록 텍스트 기준)을 Sonnet 5로 요약·태깅하고 Opus 5로 5가지 축의 AI 인사이트 평점을 매긴 뒤, 이를 **모바일 앱**에서 확인할 수 있기를 원한다. 원래 계획했던 "태그 클릭 시 영상 이동" 기능은 완전히 폐기하고, 태그를 탭하면 해당 발언의 회의록 원문으로 이동하는 것으로 대체한다.

사전 조사(v1 계획 수립 시) 결과, 사이트는 대수 드롭다운 + 회차 선택 폼으로 구성된 JS 동적 페이지이며, 실제 회의 목록/회의록 링크는 폼 제출 후에만 로드된다. 이번 버전은 회의록 **텍스트만** 수집하면 되므로, v1에서 필요했던 영상 플레이어 조사(타임코드 존재 여부 등)는 더 이상 필요 없다.

---

## Phase 0 — Backend Scaffolding

### Task 1: Initialize the backend Next.js API project with Postgres + AI Gateway

**Files:**
- Create: `backend/package.json`, `backend/next.config.ts`, `backend/tsconfig.json` (via `create-next-app`)
- Create: `backend/drizzle.config.ts`
- Create: `backend/.env.example`

**Interfaces:**
- Produces: a linked Vercel project with `DATABASE_URL` and `VERCEL_OIDC_TOKEN` available in `backend/.env.local` — Task 2 (`backend/db/client.ts`) and all later scraper/pipeline/API tasks depend on these environment variables existing.

- [ ] **Step 1: Scaffold the Next.js app (API-only)**

```bash
npx create-next-app@latest backend --typescript --app --eslint --no-tailwind --src-dir=false --import-alias "@/*" --yes
cd backend
```

- [ ] **Step 2: Install dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless ai playwright zod
npm install -D drizzle-kit tsx
```

- [ ] **Step 3: Link the Vercel project and provision Postgres via Marketplace**

```bash
vercel link --yes
vercel integration add neon
vercel env pull .env.local --yes
```

(Vercel CLI 54.x does not accept `--yes`/`--no-claim` on `vercel integration add` — use the bare command. If a future CLI version adds them back, they're harmless no-ops.)

The first time any Vercel account installs the Neon marketplace integration, Vercel requires a one-time Terms-of-Service acceptance that only a human can grant — the CLI prints a `verification_uri` (`https://vercel.com/{team}/~/integrations/accept-terms/neon?source=cli`) instead of finishing. **Do not run `vercel integration accept-terms neon --yes` on the human's behalf** — accepting a third-party EULA is their decision, not the implementer's. Stop and ask the human partner to open that URL and accept, then re-run `vercel integration add neon` followed by `vercel env pull .env.local --yes`. Confirm `DATABASE_URL` is present in `.env.local` before continuing.

- [ ] **Step 4: Confirm AI Gateway auth (OIDC, no manual key)**

`vercel env pull` also provisions `VERCEL_OIDC_TOKEN` in `.env.local`. If AI Gateway is not yet enabled for the project, enable it once at `https://vercel.com/{team}/{project}/settings` → AI Gateway, then re-run `vercel env pull .env.local --yes`. Confirm `VERCEL_OIDC_TOKEN` is present.

- [ ] **Step 5: Write `drizzle.config.ts` and `.env.example`**

```typescript
// backend/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```
# backend/.env.example
DATABASE_URL=
VERCEL_OIDC_TOKEN=
# Only needed as a fallback if OIDC is unavailable:
# AI_GATEWAY_API_KEY=
```

- [ ] **Step 6: Verify the dev server boots**

Run: `npm run dev` (from `backend/`) and confirm `http://localhost:3000` responds (the default page is fine — this project is API-only, `app/page.tsx` will be replaced by nothing meaningful and can stay as the Next.js default).

- [ ] **Step 7: Commit**

If this worktree is already a git repository (it is, if you're executing this plan via subagent-driven-development), just add and commit — do not run `git init` again:

```bash
git add -A
git commit -m "chore: scaffold backend Next.js API project with Postgres + AI Gateway wiring"
```

### Task 2: Define the database schema (no video columns)

**Files:**
- Create: `backend/db/schema.ts`
- Create: `backend/db/client.ts`

**Interfaces:**
- Produces: Drizzle table objects `meetings`, `members`, `agendaItems`, `statements`, `statementInsights` — every later scraper/pipeline/API task imports these exact names from `backend/db/schema.ts`.

- [ ] **Step 1: Write the schema**

```typescript
// backend/db/schema.ts
import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

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
// backend/db/client.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 2: Generate and review the SQL migration**

Run: `npx drizzle-kit generate` (from `backend/`). Read the generated SQL under `backend/drizzle/` to confirm the 5 tables and constraints match the schema above, and that no video-related column exists.

- [ ] **Step 3: Apply the migration**

Run: `npx drizzle-kit migrate`

- [ ] **Step 4: Verify tables exist**

Run: `npx drizzle-kit studio` (or a one-off `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`) and confirm all 5 tables are present with no video columns.

- [ ] **Step 5: Commit**

```bash
git add db drizzle.config.ts drizzle
git commit -m "feat: add Postgres schema for meetings, members, statements, insights (no video)"
```

---

## Phase 1 — Site Investigation Spike (minutes text only)

### Task 3: Inspect the meeting-list and minutes flow with Playwright

**Files:**
- Create: `backend/scripts/spike/inspect-site.ts`
- Create: `backend/scripts/spike/findings.md`

**Interfaces:**
- Produces: `backend/scripts/spike/findings.md`, which Phase 2 tasks (4–5) read before writing selectors.

- [ ] **Step 1: Write an interactive inspection script**

```typescript
// backend/scripts/spike/inspect-site.ts
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://www.gjcl.go.kr/kr/cast/plenary.do");
  console.log(await page.locator("form").first().evaluate(el => el.outerHTML));

  page.on("request", (req) => {
    if (req.url().includes(".do") || req.url().includes("ajax") || req.url().includes("json")) {
      console.log("REQUEST:", req.method(), req.url(), req.postData());
    }
  });

  await page.waitForTimeout(120000);
  await browser.close();
}

main();
```

- [ ] **Step 2: Run it and manually drive the form**

Run: `npx tsx scripts/spike/inspect-site.ts` (from `backend/`).

While it's open, manually: select 제10대, pick a 회차, open one meeting's detail/minutes view. Watch the logged `REQUEST` lines and the DOM. **Do not** investigate the video player — it is out of scope for this version.

- [ ] **Step 3: Record findings**

Write `backend/scripts/spike/findings.md` documenting, with concrete examples (real URLs/params captured from Step 2):
- The exact request (method + URL + form params) that lists meetings for 제10대 + a given category.
- Whether meeting detail/minutes text is server-rendered HTML, a separate AJAX/JSON endpoint, or a downloadable file (PDF/HWP).
- Whether minutes text is attributed per-speaker in a parseable way (e.g., `<b>홍길동 의원</b>` markers) or is unstructured prose.

- [ ] **Step 4: Commit**

```bash
git add scripts/spike
git commit -m "docs: record gjcl.go.kr meeting-list and minutes-text findings"
```

---

## Phase 2 — Scraper (meeting list + minutes text, no video)

### Task 4: Scrape the 제10대 meeting list (all categories except 5분자유발언)

**Files:**
- Create: `backend/scripts/scrape/categories.ts`
- Create: `backend/scripts/scrape/meetingList.ts`
- Test: `backend/scripts/scrape/meetingList.test.ts`

**Interfaces:**
- Consumes: URL/param patterns recorded in `backend/scripts/spike/findings.md`.
- Produces: `scrapeMeetingList(category: CouncilCategory): Promise<ScrapedMeeting[]>` where `ScrapedMeeting = { sourceMeetingId: string; category: string; title: string; sessionRound: string; sessionNo: string; meetingDate: string | null; sourceUrl: string }`. Task 6 imports this function and type.

- [ ] **Step 1: Define the category list, excluding 5분자유발언**

```typescript
// backend/scripts/scrape/categories.ts
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

Save one real captured HTML response (from Task 3) as `backend/scripts/scrape/__fixtures__/plenary-list-10th.html`.

```typescript
// backend/scripts/scrape/meetingList.test.ts
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
// backend/scripts/scrape/meetingList.ts
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

// Selector/param details below are filled in from backend/scripts/spike/findings.md
// once Phase 1 is complete.
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

### Task 5: Scrape per-speaker statement text from meeting minutes

**Files:**
- Create: `backend/scripts/scrape/minutes.ts`
- Test: `backend/scripts/scrape/minutes.test.ts`

**Interfaces:**
- Consumes: `ScrapedMeeting.sourceUrl` (Task 4).
- Produces: `scrapeMinutes(meetingUrl: string): Promise<ScrapedStatement[]>` where `ScrapedStatement = { memberName: string; agendaTitle: string | null; orderInMeeting: number; rawText: string }`. Task 6 imports this.

- [ ] **Step 1: Save a fixture and write a failing test**

Save one real minutes page as `backend/scripts/scrape/__fixtures__/minutes-sample.html` (captured in Phase 1).

```typescript
// backend/scripts/scrape/minutes.test.ts
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
// backend/scripts/scrape/minutes.ts
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

### Task 6: Orchestrate the full scrape and upsert into Postgres

**Files:**
- Create: `backend/scripts/scrape/run.ts`

**Interfaces:**
- Consumes: `scrapeMeetingList` (4), `scrapeMinutes` (5), `db`/`meetings`/`members`/`agendaItems`/`statements` (Task 2).
- Produces: populated `meetings`, `members`, `agendaItems`, `statements` tables — Phase 3 reads these.

- [ ] **Step 1: Write the orchestration script**

```typescript
// backend/scripts/scrape/run.ts
import { db } from "@/db/client";
import { meetings, members, agendaItems, statements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { COUNCIL_CATEGORIES } from "./categories";
import { scrapeMeetingList } from "./meetingList";
import { scrapeMinutes } from "./minutes";

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

      const agendaIdByTitle = new Map<string, number>();
      for (const [i, title] of agendaTitles.entries()) {
        const [row] = await db
          .insert(agendaItems)
          .values({ meetingId: meetingRow.id, title, orderInMeeting: i })
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

Temporarily filter `COUNCIL_CATEGORIES` to `["본회의"]` and run: `npx tsx scripts/scrape/run.ts` (from `backend/`).
Expected: rows appear in `meetings`, `members`, `agendaItems`, `statements` — spot-check with `npx drizzle-kit studio`.

- [ ] **Step 3: Run the full scrape across all categories**

Restore the full category list and run: `npx tsx scripts/scrape/run.ts`

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape/run.ts
git commit -m "feat: orchestrate full 제10대 scrape into Postgres (no video)"
```

---

## Phase 3 — AI Pipeline (Sonnet 5 → Opus 5)

### Task 7: Sonnet 5 summarization + tagging stage

**Files:**
- Create: `backend/lib/ai/summarize.ts`
- Test: `backend/lib/ai/summarize.test.ts`

**Interfaces:**
- Consumes: `Statement.rawText` (from `backend/db/schema.ts`).
- Produces: `summarizeStatement(rawText: string): Promise<{ summary: string; tags: string[] }>`. Task 9 imports this.

- [ ] **Step 1: Write a failing test with a mocked gateway call**

```typescript
// backend/lib/ai/summarize.test.ts
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
// backend/lib/ai/summarize.ts
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

### Task 8: Opus 5 insight-scoring stage

**Files:**
- Create: `backend/lib/ai/score.ts`
- Test: `backend/lib/ai/score.test.ts`

**Interfaces:**
- Consumes: `Statement.rawText` + `summarizeStatement` output (Task 7).
- Produces: `scoreStatement(rawText: string, summary: string): Promise<InsightScores>` where `InsightScores = { learningLevel: number; questionScore: number; ideaScore: number; feasibilityScore: number; geojeImpactScore: number; rationale: string }`. Task 9 imports this.

- [ ] **Step 1: Write a failing test**

```typescript
// backend/lib/ai/score.test.ts
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
// backend/lib/ai/score.ts
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

### Task 9: Batch pipeline runner with retry and idempotency

**Files:**
- Create: `backend/scripts/pipeline/run.ts`

**Interfaces:**
- Consumes: `summarizeStatement` (7), `scoreStatement` (8), `db`/`statements`/`statementInsights` (Task 2).
- Produces: populated `statementInsights` table — the API (Task 10) reads this directly.

- [ ] **Step 1: Write the runner with per-statement retry and failure logging**

```typescript
// backend/scripts/pipeline/run.ts
import { db } from "@/db/client";
import { statements, statementInsights } from "@/db/schema";
import { notInArray } from "drizzle-orm";
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

Temporarily add `.limit(10)` to the `pending` query, run: `npx tsx scripts/pipeline/run.ts`, and manually review the 10 rows in `statementInsights` via `npx drizzle-kit studio` for rubric sanity.

- [ ] **Step 3: Remove the limit and run the full batch**

Run: `npx tsx scripts/pipeline/run.ts`

- [ ] **Step 4: Commit**

```bash
git add scripts/pipeline/run.ts
git commit -m "feat: run Sonnet5+Opus5 insight pipeline over all scraped statements"
```

---

## Phase 4 — Backend API

### Task 10: `/api/insights` endpoint

**Files:**
- Create: `backend/app/api/insights/route.ts`
- Test: `backend/app/api/insights/route.test.ts`

**Interfaces:**
- Consumes: `db`, all 5 tables (Task 2).
- Produces: `GET /api/insights` (optional query params `member`, `meeting`, `minGeojeImpact`) returning `InsightRow[]` JSON, where `InsightRow = { statementId: number; meetingTitle: string; memberName: string; tags: string[]; learningLevel: number; questionScore: number; ideaScore: number; feasibilityScore: number; geojeImpactScore: number; summary: string; rawText: string; rationale: string }`. The mobile app (Tasks 12–14) consumes this response shape exactly.

- [ ] **Step 1: Write the joined query as a plain function, with a failing test**

```typescript
// backend/lib/queries/insights.test.ts
import { test, expect, vi } from "vitest";
import { getInsightRows } from "./insights";

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => Promise.resolve([
              {
                statementId: 1,
                meetingTitle: "제264회 임시회 제1차 본회의",
                memberName: "홍길동",
                tags: ["재해예방"],
                learningLevel: 4,
                questionScore: 3,
                ideaScore: 5,
                feasibilityScore: 3,
                geojeImpactScore: 4,
                summary: "요약",
                rawText: "원문",
                rationale: "근거",
              },
            ]),
          }),
        }),
      }),
    }),
  },
}));

test("getInsightRows returns joined rows shaped for the API", async () => {
  const rows = await getInsightRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].memberName).toBe("홍길동");
  expect(rows[0].tags).toEqual(["재해예방"]);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run lib/queries/insights.test.ts`
Expected: FAIL — `getInsightRows` is not defined.

- [ ] **Step 3: Implement the query function**

```typescript
// backend/lib/queries/insights.ts
import { db } from "@/db/client";
import { meetings, members, statements, statementInsights } from "@/db/schema";
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
  rawText: string;
  rationale: string;
}

export async function getInsightRows(): Promise<InsightRow[]> {
  return db
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
      rawText: statements.rawText,
      rationale: statementInsights.rationale,
    })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .innerJoin(members, eq(statements.memberId, members.id));
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run lib/queries/insights.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the route handler with query-param filtering**

```typescript
// backend/app/api/insights/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getInsightRows } from "@/lib/queries/insights";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const member = searchParams.get("member");
  const meeting = searchParams.get("meeting");
  const minGeojeImpact = Number(searchParams.get("minGeojeImpact") ?? "1");

  const rows = await getInsightRows();
  const filtered = rows.filter(
    (r) =>
      (!member || r.memberName === member) &&
      (!meeting || r.meetingTitle === meeting) &&
      r.geojeImpactScore >= minGeojeImpact
  );

  return NextResponse.json(filtered);
}
```

- [ ] **Step 6: Verify manually**

Run: `npm run dev` (from `backend/`), then `curl http://localhost:3000/api/insights` and confirm a JSON array matching `InsightRow[]` is returned. Try `curl "http://localhost:3000/api/insights?minGeojeImpact=4"` and confirm filtering works.

- [ ] **Step 7: Commit**

```bash
git add lib/queries/insights.ts lib/queries/insights.test.ts app/api/insights/route.ts
git commit -m "feat: add /api/insights endpoint with member/meeting/score filters"
```

---

## Phase 5 — Mobile App (Expo)

### Task 11: Initialize the Expo app and point it at the backend API

**Files:**
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/lib/api.ts`
- Create: `mobile/.env.example`

**Interfaces:**
- Produces: `fetchInsights(filters?: { member?: string; meeting?: string; minGeojeImpact?: number }): Promise<InsightRow[]>` from `mobile/lib/api.ts` — Task 12 imports this. Also produces the local type `InsightRow` (mirrors `backend`'s `InsightRow` shape; mobile does not import backend code, so this type is duplicated here intentionally).

- [ ] **Step 1: Scaffold the Expo app**

```bash
npx create-expo-app@latest mobile --template default --yes
cd mobile
npx expo install expo-router react-native-safe-area-context react-native-screens
```

- [ ] **Step 2: Configure the API base URL**

```
# mobile/.env.example
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Write the typed API client**

```typescript
// mobile/lib/api.ts
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
  rawText: string;
  rationale: string;
}

export interface InsightFilters {
  member?: string;
  meeting?: string;
  minGeojeImpact?: number;
}

export async function fetchInsights(filters: InsightFilters = {}): Promise<InsightRow[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.meeting) params.set("meeting", filters.meeting);
  if (filters.minGeojeImpact) params.set("minGeojeImpact", String(filters.minGeojeImpact));

  const res = await fetch(`${base}/api/insights?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Add the design system tokens**

Source values: `docs/design-tokens/wanted-design-system.md` (Wanted Design System, adopted as this app's visual language).

```typescript
// mobile/theme/tokens.ts
export const colors = {
  primary: { normal: "#0066FF", strong: "#005EEB", heavy: "#0054D1" },
  label: {
    normal: "#171719",
    strong: "#000000",
    neutral: "rgba(46,47,51,0.88)",
    alternative: "rgba(55,56,60,0.61)",
    assistive: "rgba(55,56,60,0.28)",
    disable: "rgba(55,56,60,0.16)",
  },
  background: { normal: "#FFFFFF", alternative: "#F7F7F8" },
  line: { normal: "rgba(112,115,124,0.22)", solid: "#EAEBEC" },
  fill: { normal: "rgba(112,115,124,0.08)", strong: "rgba(112,115,124,0.16)", alternative: "rgba(112,115,124,0.05)" },
  status: { positive: "#00BF40", cautionary: "#FF9200", negative: "#FF4242", info: "#0066FF" },
} as const;

export const fonts = {
  sans: "Pretendard JP", // body/UI text
  display: "Wanted Sans Variable", // brand/headline text
  mono: "SF Mono",
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// Tracking is specified as a range in the source (display/title: -0.023~-0.029em,
// body/label: +0.006~+0.031em). These are representative midpoints per group —
// see docs/design-tokens/wanted-design-system.md if a size needs a more exact value.
const TITLE_TRACKING_EM = -0.025;
const BODY_TRACKING_EM = 0.015;

function typeStyle(fontSize: number, lineHeightRatio: number, trackingEm: number, fontFamily: string, fontWeight: string) {
  return {
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight: Math.round(fontSize * lineHeightRatio),
    letterSpacing: Number((fontSize * trackingEm).toFixed(2)),
  };
}

export const typography = {
  display1: typeStyle(56, 1.30, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  display2: typeStyle(40, 1.30, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  display3: typeStyle(36, 1.334, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  title1: typeStyle(32, 1.375, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  title2: typeStyle(28, 1.358, TITLE_TRACKING_EM, fonts.display, fontWeights.semibold),
  title3: typeStyle(24, 1.334, TITLE_TRACKING_EM, fonts.display, fontWeights.semibold),
  heading1: typeStyle(22, 1.364, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  heading2: typeStyle(20, 1.40, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  headline1: typeStyle(18, 1.445, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  headline2: typeStyle(17, 1.412, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  body1: typeStyle(16, 1.50, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
  body2: typeStyle(15, 1.467, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
  label1: typeStyle(14, 1.429, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  label2: typeStyle(13, 1.385, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  caption1: typeStyle(12, 1.334, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
  caption2: typeStyle(11, 1.273, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
} as const;

export const spacing = {
  2: 2, 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20, 24: 24, 28: 28, 32: 32, 40: 40, 48: 48, 64: 64,
} as const;

export const radius = {
  4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20, 24: 24, full: 9999,
} as const;
```

**Font files:** Pretendard JP and Wanted Sans are open-source (`github.com/orioncactus/pretendard`, `github.com/wanteddev/wanted-sans`) but their binaries are not in this repo yet. Until they're added and loaded via `expo-font` in `mobile/app/_layout.tsx`, `fontFamily` values above fall back to the OS default font — this is an acceptable v1 gap, not a blocker. If the human partner supplies the font files, add them under `mobile/assets/fonts/` and load with `useFonts` from `expo-font` before rendering.

- [ ] **Step 5: Verify the app boots**

Run: `npx expo start` (from `mobile/`, with `backend/` running separately on port 3000) and confirm the default Expo Router screen loads in Expo Go or a simulator.

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Expo mobile app with typed API client and design tokens"
```

### Task 12: Insights list screen

**Files:**
- Create: `mobile/app/index.tsx`
- Create: `mobile/components/InsightCard.tsx`
- Create: `mobile/components/TagChip.tsx`

**Interfaces:**
- Consumes: `fetchInsights` (Task 11), `colors`/`typography`/`spacing`/`radius` (Task 11's `mobile/theme/tokens.ts`).
- Produces: navigation to `mobile/app/statement/[id].tsx` (Task 13) when a tag or card is tapped, passing the tapped row's `statementId`.

- [ ] **Step 1: Build the tappable tag chip**

```tsx
// mobile/components/TagChip.tsx
import { Pressable, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export function TagChip({ tag, statementId }: { tag: string; statementId: number }) {
  return (
    <Pressable
      onPress={() => router.push(`/statement/${statementId}`)}
      style={styles.chip}
    >
      <Text style={styles.label}>{tag}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.fill.normal,
    borderRadius: radius[16],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    marginRight: spacing[6],
    marginBottom: spacing[6],
  },
  label: { ...typography.caption1, color: colors.primary.normal },
});
```

- [ ] **Step 2: Build the card for one statement row**

```tsx
// mobile/components/InsightCard.tsx
import { View, Text, StyleSheet } from "react-native";
import type { InsightRow } from "@/lib/api";
import { TagChip } from "./TagChip";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export function InsightCard({ row }: { row: InsightRow }) {
  return (
    <View style={styles.card}>
      <Text style={styles.meeting}>{row.meetingTitle}</Text>
      <Text style={styles.member}>{row.memberName}</Text>
      <View style={styles.tagRow}>
        {row.tags.map((tag) => (
          <TagChip key={tag} tag={tag} statementId={row.statementId} />
        ))}
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.score}>학습 {row.learningLevel}</Text>
        <Text style={styles.score}>질의 {row.questionScore}</Text>
        <Text style={styles.score}>아이디어 {row.ideaScore}</Text>
        <Text style={styles.score}>실행 {row.feasibilityScore}</Text>
        <Text style={styles.score}>거제영향 {row.geojeImpactScore}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[12],
    borderRadius: radius[8],
    backgroundColor: colors.background.normal,
    marginBottom: spacing[10],
    borderWidth: 1,
    borderColor: colors.line.solid,
  },
  meeting: { ...typography.caption2, color: colors.label.alternative },
  member: { ...typography.headline2, color: colors.label.normal, marginVertical: spacing[2] },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginVertical: spacing[4] },
  scoreRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8] },
  score: { ...typography.caption1, color: colors.label.neutral },
});
```

- [ ] **Step 3: Wire the list screen**

```tsx
// mobile/app/index.tsx
import { useEffect, useState } from "react";
import { FlatList, ActivityIndicator, StyleSheet, View } from "react-native";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightCard } from "@/components/InsightCard";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);

  useEffect(() => {
    fetchInsights().then(setRows).catch(() => setRows([]));
  }, []);

  if (!rows) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(row) => String(row.statementId)}
      renderItem={({ item }) => <InsightCard row={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
```

- [ ] **Step 4: Run and manually verify**

Run: `npx expo start`, open in Expo Go/simulator, confirm the list renders real data from the backend and tapping a tag attempts navigation (Task 13 will make the destination screen real).

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx components/InsightCard.tsx components/TagChip.tsx
git commit -m "feat: render insights list with tappable tag chips"
```

### Task 13: Statement detail screen (replaces the video jump)

**Files:**
- Create: `mobile/app/statement/[id].tsx`
- Modify: `mobile/lib/api.ts`

**Interfaces:**
- Consumes: `statementId` route param (from Task 12's navigation).
- Produces: `fetchInsightById(id: number): Promise<InsightRow | null>` added to `mobile/lib/api.ts` — used only by this screen.

- [ ] **Step 1: Add a single-row fetch helper**

```typescript
// mobile/lib/api.ts (append)
export async function fetchInsightById(id: number): Promise<InsightRow | null> {
  const rows = await fetchInsights();
  return rows.find((r) => r.statementId === id) ?? null;
}
```

- [ ] **Step 2: Build the detail screen**

```tsx
// mobile/app/statement/[id].tsx
import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View, ActivityIndicator, StyleSheet } from "react-native";
import { fetchInsightById, type InsightRow } from "@/lib/api";
import { colors, typography, spacing } from "@/theme/tokens";

export default function StatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<InsightRow | null | undefined>(undefined);

  useEffect(() => {
    fetchInsightById(Number(id)).then(setRow);
  }, [id]);

  if (row === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (row === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>발언을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.meeting}>{row.meetingTitle}</Text>
      <Text style={styles.member}>{row.memberName}</Text>
      <Text style={styles.sectionTitle}>요약</Text>
      <Text style={styles.body}>{row.summary}</Text>
      <Text style={styles.sectionTitle}>회의록 원문</Text>
      <Text style={styles.body}>{row.rawText}</Text>
      <Text style={styles.sectionTitle}>AI 채점 근거</Text>
      <Text style={styles.body}>{row.rationale}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[16], backgroundColor: colors.background.normal },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.normal },
  meeting: { ...typography.caption2, color: colors.label.alternative },
  member: { ...typography.title3, color: colors.label.normal, marginBottom: spacing[12] },
  sectionTitle: { ...typography.label1, color: colors.label.normal, marginTop: spacing[12], marginBottom: spacing[4] },
  body: { ...typography.body2, color: colors.label.neutral },
});
```

- [ ] **Step 3: Run and manually verify**

Run: `npx expo start`, tap a tag from the list screen, confirm the detail screen shows the meeting title, member, summary, full 회의록 원문 text, and Opus 5 rationale — no video reference anywhere.

- [ ] **Step 4: Commit**

```bash
git add app/statement lib/api.ts
git commit -m "feat: add statement detail screen showing minutes text (replaces video jump)"
```

### Task 14: Filters (의원별, 회의별, 거제영향도 최소값)

**Files:**
- Create: `mobile/components/InsightFilters.tsx`
- Modify: `mobile/app/index.tsx`

**Interfaces:**
- Consumes: `InsightRow[]` (Task 11/12), `fetchInsights` (Task 11).
- Produces: filtered list rendering — terminal task, no downstream consumers besides Phase 6 QA.

- [ ] **Step 1: Build the filter bar**

```tsx
// mobile/components/InsightFilters.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { colors, typography, spacing, radius } from "@/theme/tokens";

interface Props {
  members: string[];
  meetings: string[];
  memberFilter: string;
  meetingFilter: string;
  minGeojeImpact: number;
  onMemberChange: (v: string) => void;
  onMeetingChange: (v: string) => void;
  onMinGeojeImpactChange: (v: number) => void;
}

export function InsightFilters({
  members,
  meetings,
  memberFilter,
  meetingFilter,
  minGeojeImpact,
  onMemberChange,
  onMeetingChange,
  onMinGeojeImpactChange,
}: Props) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Pressable onPress={() => onMemberChange("")} style={[styles.pill, !memberFilter && styles.pillActive]}>
          <Text style={[styles.pillLabel, !memberFilter && styles.pillLabelActive]}>전체 의원</Text>
        </Pressable>
        {members.map((m) => (
          <Pressable key={m} onPress={() => onMemberChange(m)} style={[styles.pill, memberFilter === m && styles.pillActive]}>
            <Text style={[styles.pillLabel, memberFilter === m && styles.pillLabelActive]}>{m}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Pressable onPress={() => onMeetingChange("")} style={[styles.pill, !meetingFilter && styles.pillActive]}>
          <Text style={[styles.pillLabel, !meetingFilter && styles.pillLabelActive]}>전체 회의</Text>
        </Pressable>
        {meetings.map((m) => (
          <Pressable key={m} onPress={() => onMeetingChange(m)} style={[styles.pill, meetingFilter === m && styles.pillActive]}>
            <Text style={[styles.pillLabel, meetingFilter === m && styles.pillLabelActive]}>{m}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onMinGeojeImpactChange(n)} style={[styles.pill, minGeojeImpact === n && styles.pillActive]}>
            <Text style={[styles.pillLabel, minGeojeImpact === n && styles.pillLabelActive]}>거제영향도 ≥ {n}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing[12], paddingTop: spacing[8] },
  row: { flexDirection: "row", marginBottom: spacing[8] },
  pill: {
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.fill.normal,
    marginRight: spacing[6],
  },
  pillActive: { backgroundColor: colors.primary.normal },
  pillLabel: { ...typography.label2, color: colors.label.normal },
  pillLabelActive: { color: colors.background.normal },
});
```

- [ ] **Step 2: Wire filters into the list screen**

```tsx
// mobile/app/index.tsx
import { useEffect, useMemo, useState } from "react";
import { FlatList, ActivityIndicator, StyleSheet, View } from "react-native";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightCard } from "@/components/InsightCard";
import { InsightFilters } from "@/components/InsightFilters";
import { colors, spacing } from "@/theme/tokens";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [memberFilter, setMemberFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [minGeojeImpact, setMinGeojeImpact] = useState(1);

  useEffect(() => {
    fetchInsights().then(setRows).catch(() => setRows([]));
  }, []);

  const members = useMemo(() => [...new Set((rows ?? []).map((r) => r.memberName))].sort(), [rows]);
  const meetings = useMemo(() => [...new Set((rows ?? []).map((r) => r.meetingTitle))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) =>
      (!memberFilter || r.memberName === memberFilter) &&
      (!meetingFilter || r.meetingTitle === meetingFilter) &&
      r.geojeImpactScore >= minGeojeImpact
  );

  if (!rows) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={filtered}
      keyExtractor={(row) => String(row.statementId)}
      ListHeaderComponent={
        <InsightFilters
          members={members}
          meetings={meetings}
          memberFilter={memberFilter}
          meetingFilter={meetingFilter}
          minGeojeImpact={minGeojeImpact}
          onMemberChange={setMemberFilter}
          onMeetingChange={setMeetingFilter}
          onMinGeojeImpactChange={setMinGeojeImpact}
        />
      }
      renderItem={({ item }) => <InsightCard row={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing[12], backgroundColor: colors.background.alternative, flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.alternative },
});
```

- [ ] **Step 3: Verify manually**

Run: `npx expo start`, confirm each filter narrows the list correctly and combinations work together.

- [ ] **Step 4: Commit**

```bash
git add app/index.tsx components/InsightFilters.tsx
git commit -m "feat: add member/meeting/geoje-impact filters to mobile list screen"
```

---

## Phase 6 — Verification & Deployment

- [ ] **Step 1: Cross-check scraped data against source**

Pick 2 meetings at random from `meetings`. Open their `sourceUrl` in a real browser and manually confirm the scraped `statements.rawText` for at least 3 speakers matches the real minutes text.

- [ ] **Step 2: Rubric sanity pass on AI scores**

Pick 10 rows from `statementInsights` spanning different members. Read the `summary`, `rationale`, and 5 scores side by side with the original `rawText` and confirm a human would broadly agree with the ratings. Adjust the Task 8 prompt rubric wording if scores skew unrealistically high/low across the board, then re-run Task 9 for the affected statements (delete their `statementInsights` rows first).

- [ ] **Step 3: End-to-end mobile QA**

With `backend/` running (or deployed) and `EXPO_PUBLIC_API_BASE_URL` pointed at it, run the mobile app in Expo Go/simulator and manually verify: list renders all fields, tag tap opens the correct statement's detail screen with full 회의록 원문, and all filters work individually and combined.

- [ ] **Step 4: Deploy the backend to Vercel**

```bash
cd backend
vercel --prod
```

Confirm the production URL responds at `/api/insights` (i.e., `DATABASE_URL` is set in the Vercel project's production environment — `VERCEL_OIDC_TOKEN` is auto-managed on Vercel deployments).

- [ ] **Step 5: Point the mobile app at production and build with EAS**

Update `mobile/.env` (not `.env.example`) with `EXPO_PUBLIC_API_BASE_URL=<production backend URL>`, then:

```bash
cd mobile
npx eas build --platform all --profile preview
```

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "chore: verify end-to-end pipeline and deploy backend + mobile build"
```
