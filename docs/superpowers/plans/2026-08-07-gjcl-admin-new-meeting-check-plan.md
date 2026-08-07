# 관리자용 신규 회의 체크·처리 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design spec:** `docs/superpowers/specs/2026-08-07-gjcl-admin-new-meeting-check-design.md`

**Goal:** Add a PIN-locked mobile admin screen that checks gjcl.go.kr for meetings not yet in the DB, scrapes a chosen one on demand, and drives the existing 8-axis AI pipeline via client-side polling — no Cron, no schema changes, no new auth system beyond a shared PIN.

**Architecture:** Three new Next.js API routes (`check-new-meetings`, `scrape-meeting`, `process-batch`) under `app/api/admin/`, guarded by a shared PIN header check. They reuse the existing scraper (`scripts/scrape/*`) and pipeline (`scripts/pipeline/run.ts`) logic, which is first extracted into two reusable `lib/` modules so the CLI scripts and the new API routes share one implementation. The mobile app gets one new screen (`mobile/src/app/admin/index.tsx`) that stores the PIN in `expo-secure-store` and polls `process-batch` while open.

**Tech Stack:** Next.js App Router API routes (Node runtime), Playwright (`playwright-core` + `@sparticuz/chromium` for the Vercel-deployed path, full `playwright` unchanged for local CLI use), Drizzle ORM, Expo Router + `expo-secure-store` (mobile).

## Global Constraints

- All three admin routes require header `x-admin-pin` matching the `ADMIN_PIN` environment variable. No PIN or wrong PIN → `401`.
- No new database tables or columns. Reuse `meetings`/`statements`/`statement_insights` exactly as they are.
- No Cron. Background AI processing is driven by the mobile client polling `process-batch` only while its admin screen is open.
- `scripts/scrape/run.ts` and `scripts/pipeline/run.ts` must keep working unchanged from the CLI after refactor — the extraction tasks are behavior-preserving.
- Reuse the 8-axis pipeline exactly as committed (`lib/ai/summarize.ts`, `lib/ai/score.ts`, `lib/scoring/weightedAverage.ts`, `lib/members/isNonMemberSpeaker.ts`) — do not modify their rubric logic in this plan.

---

## Task 1: Serverless-safe Chromium launcher

**Files:**
- Create: `backend/scripts/scrape/launchBrowser.ts`
- Modify: `backend/scripts/scrape/session.ts`
- Modify: `backend/scripts/scrape/minutes.ts`
- Modify: `backend/package.json` (add `@sparticuz/chromium`, `playwright-core`)

**Interfaces:**
- Produces: `launchChromium(): Promise<Browser>` (Browser type from `playwright-core`) — used by Task 2 and Task 6's route indirectly via `scrapeMinutes`, and by `openCouncilSession`.

Both `scripts/scrape/session.ts`'s `openCouncilSession()` and `scripts/scrape/minutes.ts`'s `scrapeMinutes()` currently call `chromium.launch()` from the full `playwright` package directly. That package bundles its own browser binaries, which are far too large to ship in a Vercel function. `@sparticuz/chromium` provides a serverless-sized Chromium binary that `playwright-core` (the driver without bundled browsers) can launch via an explicit `executablePath`. Locally (CLI scripts), keep using the full `playwright` package unchanged — no behavior change for local development.

- [ ] **Step 1: Install the new dependencies**

```bash
cd backend
npm install @sparticuz/chromium playwright-core
```

- [ ] **Step 2: Create the launcher**

```typescript
// backend/scripts/scrape/launchBrowser.ts
import type { Browser } from "playwright-core";

// Running headless Chromium inside a Vercel serverless function requires a
// serverless-sized binary (@sparticuz/chromium) driven by playwright-core,
// instead of the full `playwright` package whose bundled browser binaries are
// far too large for a Vercel function deployment. Locally (CLI scripts under
// scripts/), we keep using the full `playwright` package's own bundled
// Chromium — no special setup needed for local development.
export async function launchChromium(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: playwrightCore } = await import("playwright-core");
    return playwrightCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const { chromium: playwright } = await import("playwright");
  return playwright.launch();
}
```

- [ ] **Step 3: Point `session.ts` at the shared launcher**

In `backend/scripts/scrape/session.ts`, replace:

```typescript
import { chromium, type Browser, type Page } from "playwright";
```

with:

```typescript
import type { Browser, Page } from "playwright-core";
import { launchChromium } from "./launchBrowser";
```

and inside `openCouncilSession()`, replace:

```typescript
const browser = await chromium.launch();
```

with:

```typescript
const browser = await launchChromium();
```

- [ ] **Step 4: Point `minutes.ts` at the shared launcher**

In `backend/scripts/scrape/minutes.ts`, replace:

```typescript
import { chromium } from "playwright";
```

with:

```typescript
import { launchChromium } from "./launchBrowser";
```

and inside `scrapeMinutes()`, replace:

```typescript
const browser = await chromium.launch();
```

with:

```typescript
const browser = await launchChromium();
```

- [ ] **Step 5: Verify local scraping still works unchanged**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (the `Browser`/`Page` types from `playwright-core` are structurally the same shapes `playwright` re-exports, so existing call sites like `session.page` keep compiling).

Run a small local smoke test (does not hit `process.env.VERCEL`, so it exercises the full-`playwright` branch — the branch already proven to work in Tasks 1–14 of the original plan):

```bash
cd backend
npx tsx --env-file=.env.local -e "
import('./scripts/scrape/session').then(async ({ openCouncilSession }) => {
  const { browser, session } = await openCouncilSession();
  console.log('csrfToken:', session.csrfToken.slice(0, 8) + '...');
  await browser.close();
});
"
```

Expected: prints a truncated CSRF token, no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape/launchBrowser.ts scripts/scrape/session.ts scripts/scrape/minutes.ts package.json package-lock.json
git commit -m "feat: add serverless-safe Chromium launcher for Vercel-deployed scraping"
```

---

## Task 2: Extract shared meeting-upsert logic

**Files:**
- Create: `backend/lib/scrape/upsertMeeting.ts`
- Modify: `backend/scripts/scrape/run.ts`

**Interfaces:**
- Consumes: `ScrapedMeeting` (from `@/scripts/scrape/meetingList`), `scrapeMinutes` (from `@/scripts/scrape/minutes`)
- Produces: `upsertScrapedMeeting(m: ScrapedMeeting): Promise<{ meetingId: number; statementsAdded: number }>` — used by Task 6's `scrape-meeting` route and by the refactored `scripts/scrape/run.ts`.

This pulls the per-meeting upsert block (meeting row → scrape minutes → agenda items → members → statements) out of `scripts/scrape/run.ts`'s loop, unchanged in behavior, so the new admin route can scrape exactly one meeting without duplicating the upsert logic.

- [ ] **Step 1: Create the shared function**

```typescript
// backend/lib/scrape/upsertMeeting.ts
import { db } from "@/db/client";
import { meetings, members, agendaItems, statements } from "@/db/schema";
import { scrapeMinutes } from "@/scripts/scrape/minutes";
import type { ScrapedMeeting } from "@/scripts/scrape/meetingList";

export async function upsertScrapedMeeting(m: ScrapedMeeting): Promise<{ meetingId: number; statementsAdded: number }> {
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
      .onConflictDoUpdate({ target: [agendaItems.meetingId, agendaItems.title], set: { title } })
      .returning();
    agendaIdByTitle.set(title, row.id);
  }

  let statementsAdded = 0;
  for (const s of scrapedStatements) {
    const [memberRow] = await db
      .insert(members)
      .values({ name: s.memberName, generation: "제10대" })
      .onConflictDoUpdate({ target: [members.name, members.generation], set: { name: s.memberName } })
      .returning();

    const inserted = await db
      .insert(statements)
      .values({
        meetingId: meetingRow.id,
        agendaItemId: s.agendaTitle ? agendaIdByTitle.get(s.agendaTitle) ?? null : null,
        memberId: memberRow.id,
        rawText: s.rawText,
        orderInMeeting: s.orderInMeeting,
      })
      .onConflictDoNothing()
      .returning({ id: statements.id });
    if (inserted.length > 0) statementsAdded++;
  }

  return { meetingId: meetingRow.id, statementsAdded };
}
```

- [ ] **Step 2: Refactor `scripts/scrape/run.ts` to use it**

Replace the entire `try { ... } catch` body inside the `for (const m of meetingRows)` loop with:

```typescript
      try {
        const { statementsAdded } = await upsertScrapedMeeting(m);
        console.log(`Scraped: ${m.title} (${statementsAdded} new statements, category=${category.label})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`FAILED: ${m.title} (category=${category.label}, url=${m.sourceUrl}): ${message}`);
        failures.push({ title: m.title, sourceUrl: m.sourceUrl, error: message });
      }
```

Update the imports at the top of `scripts/scrape/run.ts`:

```typescript
import { openCouncilSession } from "./session";
import { scrapeCategories, scrapeMeetingList } from "./meetingList";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";
```

(remove the now-unused `db`, `meetings`, `members`, `agendaItems`, `statements`, `scrapeMinutes` imports from `run.ts` — `upsertMeeting.ts` owns those now).

- [ ] **Step 3: Typecheck and diff-review**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

Read the diff on `scripts/scrape/run.ts` and confirm the only behavior change is the log line now reporting `statementsAdded` (new statements only) instead of `scrapedStatements.length` (all statements scraped from the page, including already-seen ones on a re-run) — this is a strict improvement in log accuracy, not a functional change to what gets written to the DB.

- [ ] **Step 4: Commit**

```bash
git add lib/scrape/upsertMeeting.ts scripts/scrape/run.ts
git commit -m "refactor: extract per-meeting upsert logic into lib/scrape/upsertMeeting.ts"
```

---

## Task 3: Extract shared statement-processing logic, with tests

**Files:**
- Create: `backend/lib/pipeline/processStatement.ts`
- Create: `backend/lib/pipeline/processStatement.test.ts`
- Modify: `backend/scripts/pipeline/run.ts`

**Interfaces:**
- Produces:
  - `getPendingStatementIds(limit?: number): Promise<number[]>`
  - `countPendingStatements(): Promise<number>`
  - `processOneStatement(statementId: number): Promise<ProcessResult>` where `ProcessResult = { statementId: number; outcome: "processed" | "excluded" | "failed"; reason?: string }`
- Used by: Task 7's `process-batch` route, and the refactored `scripts/pipeline/run.ts`.

This pulls the entire per-statement body out of `scripts/pipeline/run.ts`'s loop (unchanged behavior: non-member check → procedural check → prior-context lookup → Opus 5 scoring → weighted average → insert) into a testable module. This is the **first time this logic gets unit tests** — it was previously only exercised by live runs.

- [ ] **Step 1: Create the shared module**

```typescript
// backend/lib/pipeline/processStatement.ts
import { db } from "@/db/client";
import { statements, statementInsights, members, meetings, agendaItems } from "@/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { summarizeStatement } from "@/lib/ai/summarize";
import { scoreStatement, type PriorStatementContext } from "@/lib/ai/score";
import { computeWeightedScore, type AxisScores } from "@/lib/scoring/weightedAverage";
import { isNonMemberSpeaker } from "@/lib/members/isNonMemberSpeaker";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Account is on a strict burst rate limit for claude-opus-5 (observed:
      // roughly 1 request lands per ~5 back-to-back attempts). 5s/10s/20s backoff.
      await sleep(5000 * 2 ** i);
    }
  }
  throw lastErr;
}

async function getPriorContext(memberId: number, currentMeetingId: number): Promise<PriorStatementContext[]> {
  const rows = await db
    .select({ meetingTitle: meetings.title, summary: statementInsights.summary, meetingId: statements.meetingId })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .where(and(eq(statements.memberId, memberId), isNull(statementInsights.excludedReason)))
    .orderBy(statements.meetingId)
    .limit(3);

  return rows.filter((r) => r.meetingId !== currentMeetingId).map((r) => ({ meetingTitle: r.meetingTitle, summary: r.summary }));
}

export async function getPendingStatementIds(limit?: number): Promise<number[]> {
  const alreadyProcessed = await db.select({ statementId: statementInsights.statementId }).from(statementInsights);
  const processedIds = alreadyProcessed.map((r) => r.statementId);
  const base = processedIds.length
    ? db.select({ id: statements.id }).from(statements).where(notInArray(statements.id, processedIds))
    : db.select({ id: statements.id }).from(statements);
  const rows = limit ? await base.limit(limit) : await base;
  return rows.map((s) => s.id);
}

export async function countPendingStatements(): Promise<number> {
  const allIds = await db.select({ id: statements.id }).from(statements);
  const processedRows = await db.select({ statementId: statementInsights.statementId }).from(statementInsights);
  const processedSet = new Set(processedRows.map((r) => r.statementId));
  return allIds.filter((s) => !processedSet.has(s.id)).length;
}

export type ProcessOutcome = "processed" | "excluded" | "failed";
export interface ProcessResult {
  statementId: number;
  outcome: ProcessOutcome;
  reason?: string;
}

export async function processOneStatement(statementId: number): Promise<ProcessResult> {
  const [stmt] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!stmt) return { statementId, outcome: "failed", reason: "statement not found" };

  const [member] = await db.select().from(members).where(eq(members.id, stmt.memberId));
  const agendaTitle = stmt.agendaItemId
    ? (await db.select().from(agendaItems).where(eq(agendaItems.id, stmt.agendaItemId)))[0]?.title ?? null
    : null;

  if (isNonMemberSpeaker(member.name)) {
    await db.insert(statementInsights).values({
      statementId: stmt.id,
      summary: stmt.rawText.slice(0, 200),
      tags: [],
      excludedReason: "의원 아님(집행부/사무국)",
      sonnetModel: "n/a",
    });
    return { statementId, outcome: "excluded", reason: "의원 아님(집행부/사무국)" };
  }

  try {
    const { summary, tags, isProcedural, speechType } = await withRetry(() =>
      summarizeStatement(stmt.rawText, agendaTitle)
    );

    if (isProcedural) {
      await db.insert(statementInsights).values({
        statementId: stmt.id,
        summary,
        tags,
        excludedReason: "의사진행 발언",
        sonnetModel: "claude-sonnet-5",
      });
      return { statementId, outcome: "excluded", reason: "의사진행 발언" };
    }

    const priorContext = await getPriorContext(stmt.memberId, stmt.meetingId);
    const scores = await withRetry(() => scoreStatement(stmt.rawText, summary, speechType, priorContext));

    const axisScores: AxisScores = {
      creativity: scores.creativity,
      feasibility: scores.feasibility,
      evidenceLegal: scores.evidenceLegal,
      persistence: scores.persistence,
      oversight: scores.oversight,
      citizenBenefit: scores.citizenBenefit,
      futureStrategy: scores.futureStrategy,
      cityDevelopment: scores.cityDevelopment,
    };
    const weightedScore = computeWeightedScore(axisScores, speechType);

    await db.insert(statementInsights).values({
      statementId: stmt.id,
      summary,
      tags,
      speechType,
      creativity: scores.creativity,
      feasibility: scores.feasibility,
      evidenceLegal: scores.evidenceLegal,
      persistence: scores.persistence,
      persistenceStatus: scores.persistence === null ? "pending_future_evaluation" : "scored",
      oversight: scores.oversight,
      citizenBenefit: scores.citizenBenefit,
      futureStrategy: scores.futureStrategy,
      cityDevelopment: scores.cityDevelopment,
      weightedScore: weightedScore === null ? null : String(weightedScore),
      topicsToWatch: scores.topicsToWatch,
      rationale: scores.rationale,
      sonnetModel: "claude-sonnet-5",
      opusModel: "claude-opus-5",
    });

    return { statementId, outcome: "processed" };
  } catch (err) {
    return { statementId, outcome: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// backend/lib/pipeline/processStatement.test.ts
import { test, expect, vi, beforeEach } from "vitest";

const mockStatement = { id: 1, meetingId: 1, memberId: 1, agendaItemId: null, rawText: "발언 원문", orderInMeeting: 0 };
const mockMember = { id: 1, name: "홍길동", generation: "제10대" };
const nonMemberRow = { id: 2, name: "부시장 민기식", generation: "제10대" };

let statementsTable: any;
let membersTable: any;

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));
vi.mock("@/lib/ai/summarize", () => ({ summarizeStatement: vi.fn() }));
vi.mock("@/lib/ai/score", () => ({ scoreStatement: vi.fn() }));

import { db } from "@/db/client";
import { summarizeStatement } from "@/lib/ai/summarize";
import { scoreStatement } from "@/lib/ai/score";
import { processOneStatement } from "./processStatement";

// `processOneStatement` issues several different `db.select()` chain shapes:
// plain `.from().where()` for single-row lookups, and a longer
// `.from().innerJoin().innerJoin().where().orderBy().limit()` chain for the
// prior-context query. This mock supports any chain length/order by having
// every method return a new chainable that resolves to the same `result` when
// awaited (real drizzle query builders are themselves thenable, which is what
// makes `await db.select()...chain...` work without a trailing `.then()` call).
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
  expect(scoreStatement).not.toHaveBeenCalled();
  expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ excludedReason: "의원 아님(집행부/사무국)" }));
});

test("excludes procedural statements without calling scoreStatement", async () => {
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
  });

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "excluded", reason: "의사진행 발언" });
  expect(scoreStatement).not.toHaveBeenCalled();
});

test("scores a substantive statement and computes weightedScore", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement])) // statements
    .mockReturnValueOnce(chainable([mockMember])) // members
    .mockReturnValueOnce(chainable([])); // prior context join query (innerJoin x2 + orderBy + limit)
  const insertValues = vi.fn(() => Promise.resolve());
  (db.insert as any).mockReturnValue({ values: insertValues });
  (summarizeStatement as any).mockResolvedValue({
    summary: "실질 발언 요약",
    tags: ["예산"],
    isProcedural: false,
    speechType: "budget_review",
  });
  (scoreStatement as any).mockResolvedValue({
    creativity: 3,
    feasibility: 4,
    evidenceLegal: 4,
    persistence: null,
    oversight: 3,
    citizenBenefit: 3,
    futureStrategy: 3,
    cityDevelopment: 3,
    topicsToWatch: [],
    rationale: "근거",
  });

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "processed" });
  expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ persistenceStatus: "pending_future_evaluation" }));
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd backend && npx vitest run lib/pipeline/processStatement.test.ts`
Expected: 3 passed. (Writing them as failing-first isn't meaningful here since the implementation already exists from Step 1 — this step is the real verification gate.)

- [ ] **Step 4: Refactor `scripts/pipeline/run.ts` to use the shared module**

```typescript
// backend/scripts/pipeline/run.ts
import { getPendingStatementIds, processOneStatement } from "@/lib/pipeline/processStatement";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const pendingIds = await getPendingStatementIds();
  const total = pendingIds.length;
  console.log(`Starting run: ${total} pending statements`);

  let i = 0;
  for (const id of pendingIds) {
    i++;
    if (i % 25 === 0) console.log(`--- progress: ${i}/${total} ---`);

    const result = await processOneStatement(id);
    if (result.outcome === "processed") {
      console.log(`Processed statement ${result.statementId}`);
    } else if (result.outcome === "excluded") {
      console.log(`Excluded statement ${result.statementId} (${result.reason})`);
    } else {
      console.error(`Failed statement ${result.statementId}: ${result.reason}`);
    }

    // Politeness delay between statements — avoids re-triggering the account's
    // Opus 5 burst rate limit.
    await sleep(4000);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
```

- [ ] **Step 5: Typecheck and run the full test suite**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass (existing 23 + the 3 new ones = 26).

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/processStatement.ts lib/pipeline/processStatement.test.ts scripts/pipeline/run.ts
git commit -m "refactor: extract statement-processing loop into lib/pipeline/processStatement.ts, add unit tests"
```

---

## Task 4: PIN guard + verify-pin route

**Files:**
- Create: `backend/lib/admin/requirePin.ts`
- Create: `backend/lib/admin/requirePin.test.ts`
- Create: `backend/app/api/admin/verify-pin/route.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `requireAdminPin(request: NextRequest): NextResponse | null` — returns a `401` `NextResponse` if the PIN is missing/wrong, `null` if valid. Used by all four admin routes (this task's `verify-pin`, and Tasks 5–7).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/lib/admin/requirePin.test.ts
import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireAdminPin } from "./requirePin";

test("returns 401 when the header is missing", async () => {
  vi.stubEnv("ADMIN_PIN", "1234");
  const req = new NextRequest("http://localhost:3000/api/admin/verify-pin", { method: "POST" });
  const result = requireAdminPin(req);
  expect(result).not.toBeNull();
  expect(result!.status).toBe(401);
});

test("returns 401 when the header doesn't match ADMIN_PIN", async () => {
  vi.stubEnv("ADMIN_PIN", "1234");
  const req = new NextRequest("http://localhost:3000/api/admin/verify-pin", {
    method: "POST",
    headers: { "x-admin-pin": "0000" },
  });
  const result = requireAdminPin(req);
  expect(result).not.toBeNull();
  expect(result!.status).toBe(401);
});

test("returns null when the header matches ADMIN_PIN", async () => {
  vi.stubEnv("ADMIN_PIN", "1234");
  const req = new NextRequest("http://localhost:3000/api/admin/verify-pin", {
    method: "POST",
    headers: { "x-admin-pin": "1234" },
  });
  const result = requireAdminPin(req);
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run lib/admin/requirePin.test.ts`
Expected: FAIL with "Cannot find module './requirePin'"

- [ ] **Step 3: Implement**

```typescript
// backend/lib/admin/requirePin.ts
import { NextRequest, NextResponse } from "next/server";

export function requireAdminPin(request: NextRequest): NextResponse | null {
  const pin = request.headers.get("x-admin-pin");
  if (!pin || pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "invalid pin" }, { status: 401 });
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run lib/admin/requirePin.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Add the `verify-pin` route**

```typescript
// backend/app/api/admin/verify-pin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Document the new env var**

Append to `backend/.env.example`:

```
ADMIN_PIN=
```

- [ ] **Step 7: Set the env var for local dev and on Vercel**

Add a real PIN value to `backend/.env.local` (not committed), then set the same value on Vercel:

```bash
vercel env add ADMIN_PIN
```

Choose a PIN, apply it to Development/Preview/Production as appropriate.

- [ ] **Step 8: Manual verification**

```bash
cd backend && npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:3000/api/admin/verify-pin -H "x-admin-pin: wrong"
curl -X POST http://localhost:3000/api/admin/verify-pin -H "x-admin-pin: <your real ADMIN_PIN>"
```

Expected: first call returns `401` + `{"error":"invalid pin"}`, second returns `200` + `{"ok":true}`.

- [ ] **Step 9: Commit**

```bash
git add lib/admin/requirePin.ts lib/admin/requirePin.test.ts app/api/admin/verify-pin/route.ts .env.example
git commit -m "feat: add admin PIN guard and verify-pin endpoint"
```

---

## Task 5: `POST /api/admin/check-new-meetings`

**Files:**
- Create: `backend/app/api/admin/check-new-meetings/route.ts`
- Create: `backend/app/api/admin/check-new-meetings/route.test.ts`

**Interfaces:**
- Consumes: `requireAdminPin` (Task 4), `openCouncilSession` (`@/scripts/scrape/session`), `scrapeCategories`/`scrapeMeetingList`/`ScrapedMeeting` (`@/scripts/scrape/meetingList`), `db`/`meetings` schema
- Produces: response shape `{ newMeetings: ScrapedMeeting[] }`, consumed by the mobile client (Task 8/9).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/app/api/admin/check-new-meetings/route.test.ts
import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/scripts/scrape/session", () => ({
  openCouncilSession: vi.fn(() =>
    Promise.resolve({ browser: { close: vi.fn() }, session: { page: {}, csrfToken: "tok" } })
  ),
}));
vi.mock("@/scripts/scrape/meetingList", () => ({
  scrapeCategories: vi.fn(() => Promise.resolve([{ cmtCd: "C1", label: "본회의" }])),
  scrapeMeetingList: vi.fn(() =>
    Promise.resolve([
      { sourceMeetingId: "100", category: "본회의", title: "기존 회의", sessionRound: "제264회", sessionNo: "제1차", meetingDate: "2026-07-20", sourceUrl: "https://x/100" },
      { sourceMeetingId: "200", category: "본회의", title: "신규 회의", sessionRound: "제265회", sessionNo: "제1차", meetingDate: "2026-08-10", sourceUrl: "https://x/200" },
    ])
  ),
}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => Promise.resolve([{ sourceMeetingId: "100" }]) }) },
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");

test("returns only meetings not already in the DB", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/check-new-meetings", {
    method: "POST",
    headers: { "x-admin-pin": "1234" },
  });
  const res = await POST(req);
  const body = await res.json();
  expect(body.newMeetings).toHaveLength(1);
  expect(body.newMeetings[0].sourceMeetingId).toBe("200");
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/check-new-meetings", { method: "POST" });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run app/api/admin/check-new-meetings/route.test.ts`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 3: Implement the route**

```typescript
// backend/app/api/admin/check-new-meetings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { openCouncilSession } from "@/scripts/scrape/session";
import { scrapeCategories, scrapeMeetingList, type ScrapedMeeting } from "@/scripts/scrape/meetingList";
import { db } from "@/db/client";
import { meetings } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const existingRows = await db.select({ sourceMeetingId: meetings.sourceMeetingId }).from(meetings);
  const existingIds = new Set(existingRows.map((r) => r.sourceMeetingId));

  const { browser, session } = await openCouncilSession();
  const allScraped: ScrapedMeeting[] = [];
  try {
    const categories = await scrapeCategories(session);
    for (const category of categories) {
      const meetingRows = await scrapeMeetingList(session, category);
      allScraped.push(...meetingRows);
    }
  } finally {
    await browser.close();
  }

  const newMeetings = allScraped.filter((m) => !existingIds.has(m.sourceMeetingId));
  return NextResponse.json({ newMeetings });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run app/api/admin/check-new-meetings/route.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/check-new-meetings/
git commit -m "feat: add /api/admin/check-new-meetings endpoint"
```

---

## Task 6: `POST /api/admin/scrape-meeting`

**Files:**
- Create: `backend/app/api/admin/scrape-meeting/route.ts`
- Create: `backend/app/api/admin/scrape-meeting/route.test.ts`

**Interfaces:**
- Consumes: `requireAdminPin` (Task 4), `upsertScrapedMeeting` (Task 2), `ScrapedMeeting` type (`@/scripts/scrape/meetingList`)
- Produces: response shape `{ statementsAdded: number }`

Request body is the full `ScrapedMeeting` object the client already received from `check-new-meetings` — this avoids a second full category walk just to look up one meeting's URL.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/app/api/admin/scrape-meeting/route.test.ts
import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/scrape/upsertMeeting", () => ({
  upsertScrapedMeeting: vi.fn(() => Promise.resolve({ meetingId: 42, statementsAdded: 87 })),
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");
const { upsertScrapedMeeting } = await import("@/lib/scrape/upsertMeeting");

const sampleMeeting = {
  sourceMeetingId: "200",
  category: "본회의",
  title: "신규 회의",
  sessionRound: "제265회",
  sessionNo: "제1차",
  meetingDate: "2026-08-10",
  sourceUrl: "https://x/200",
};

test("scrapes the given meeting and returns the added-statement count", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ meeting: sampleMeeting }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(body.statementsAdded).toBe(87);
  expect(upsertScrapedMeeting).toHaveBeenCalledWith(sampleMeeting);
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meeting: sampleMeeting }),
  });
  const res = await POST(req);
  expect(res.status).toBe(401);
});

test("returns 400 when the meeting body is missing required fields", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ meeting: { title: "제목만 있음" } }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run app/api/admin/scrape-meeting/route.test.ts`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 3: Implement the route**

```typescript
// backend/app/api/admin/scrape-meeting/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { upsertScrapedMeeting } from "@/lib/scrape/upsertMeeting";

export const runtime = "nodejs";
export const maxDuration = 300;

const ScrapedMeetingSchema = z.object({
  sourceMeetingId: z.string(),
  category: z.string(),
  title: z.string(),
  sessionRound: z.string(),
  sessionNo: z.string(),
  meetingDate: z.string().nullable(),
  sourceUrl: z.string(),
});
const BodySchema = z.object({ meeting: ScrapedMeetingSchema });

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const json = await request.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid meeting payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { statementsAdded } = await upsertScrapedMeeting(parsed.data.meeting);
  return NextResponse.json({ statementsAdded });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run app/api/admin/scrape-meeting/route.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/scrape-meeting/
git commit -m "feat: add /api/admin/scrape-meeting endpoint"
```

---

## Task 7: `POST /api/admin/process-batch`

**Files:**
- Create: `backend/app/api/admin/process-batch/route.ts`
- Create: `backend/app/api/admin/process-batch/route.test.ts`

**Interfaces:**
- Consumes: `requireAdminPin` (Task 4), `getPendingStatementIds`/`processOneStatement`/`countPendingStatements` (Task 3)
- Produces: response shape `{ processed: number; excluded: number; failed: number; remaining: number }`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/app/api/admin/process-batch/route.test.ts
import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/pipeline/processStatement", () => ({
  getPendingStatementIds: vi.fn(() => Promise.resolve([1, 2, 3])),
  processOneStatement: vi.fn((id: number) =>
    Promise.resolve(
      id === 1
        ? { statementId: 1, outcome: "processed" }
        : id === 2
          ? { statementId: 2, outcome: "excluded", reason: "의사진행 발언" }
          : { statementId: 3, outcome: "failed", reason: "rate limited" }
    )
  ),
  countPendingStatements: vi.fn(() => Promise.resolve(339)),
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");
const { getPendingStatementIds } = await import("@/lib/pipeline/processStatement");

test("tallies processed/excluded/failed and reports remaining count", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/process-batch", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ limit: 3 }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(body).toEqual({ processed: 1, excluded: 1, failed: 1, remaining: 339 });
});

test("clamps limit to the server-side maximum of 10", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/process-batch", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ limit: 999 }),
  });
  await POST(req);
  expect(getPendingStatementIds).toHaveBeenCalledWith(10);
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/process-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 5 }),
  });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run app/api/admin/process-batch/route.test.ts`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 3: Implement the route**

```typescript
// backend/app/api/admin/process-batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";
import { getPendingStatementIds, processOneStatement, countPendingStatements } from "@/lib/pipeline/processStatement";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10; // worst case ~10 * 39s (retries + delay) stays under maxDuration

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;

  const json = await request.json().catch(() => ({}));
  const requestedLimit = typeof json.limit === "number" ? json.limit : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);

  const ids = await getPendingStatementIds(limit);

  let processed = 0;
  let excluded = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await processOneStatement(id);
    if (result.outcome === "processed") processed++;
    else if (result.outcome === "excluded") excluded++;
    else failed++;
  }

  const remaining = await countPendingStatements();
  return NextResponse.json({ processed, excluded, failed, remaining });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run app/api/admin/process-batch/route.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Full backend verification**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/process-batch/
git commit -m "feat: add /api/admin/process-batch endpoint"
```

---

## Task 8: Mobile — admin API client and PIN storage

**Files:**
- Create: `mobile/src/lib/adminApi.ts`
- Modify: `mobile/package.json` (add `expo-secure-store`)

**Interfaces:**
- Produces:
  - `verifyPin(pin: string): Promise<boolean>`
  - `savePin(pin: string): Promise<void>`, `loadPin(): Promise<string | null>`, `clearPin(): Promise<void>`
  - `checkNewMeetings(pin: string): Promise<ScrapedMeetingSummary[]>`
  - `scrapeMeeting(pin: string, meeting: ScrapedMeetingSummary): Promise<{ statementsAdded: number }>`
  - `processBatch(pin: string, limit: number): Promise<{ processed: number; excluded: number; failed: number; remaining: number }>`
- Used by: Task 9's admin screen.

- [ ] **Step 1: Install `expo-secure-store`**

```bash
cd mobile
npx expo install expo-secure-store
```

- [ ] **Step 2: Create the admin API client**

```typescript
// mobile/src/lib/adminApi.ts
import * as SecureStore from "expo-secure-store";

const PIN_KEY = "gjcl_admin_pin";

export interface ScrapedMeetingSummary {
  sourceMeetingId: string;
  category: string;
  title: string;
  sessionRound: string;
  sessionNo: string;
  meetingDate: string | null;
  sourceUrl: string;
}

export interface ProcessBatchResult {
  processed: number;
  excluded: number;
  failed: number;
  remaining: number;
}

function apiBase(): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  return base;
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function loadPin(): Promise<string | null> {
  return SecureStore.getItemAsync(PIN_KEY);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/verify-pin`, {
    method: "POST",
    headers: { "x-admin-pin": pin },
  });
  return res.ok;
}

export async function checkNewMeetings(pin: string): Promise<ScrapedMeetingSummary[]> {
  const res = await fetch(`${apiBase()}/api/admin/check-new-meetings`, {
    method: "POST",
    headers: { "x-admin-pin": pin },
  });
  if (!res.ok) throw new Error(`check-new-meetings failed: ${res.status}`);
  const body = await res.json();
  return body.newMeetings;
}

export async function scrapeMeeting(pin: string, meeting: ScrapedMeetingSummary): Promise<{ statementsAdded: number }> {
  const res = await fetch(`${apiBase()}/api/admin/scrape-meeting`, {
    method: "POST",
    headers: { "x-admin-pin": pin, "content-type": "application/json" },
    body: JSON.stringify({ meeting }),
  });
  if (!res.ok) throw new Error(`scrape-meeting failed: ${res.status}`);
  return res.json();
}

export async function processBatch(pin: string, limit: number): Promise<ProcessBatchResult> {
  const res = await fetch(`${apiBase()}/api/admin/process-batch`, {
    method: "POST",
    headers: { "x-admin-pin": pin, "content-type": "application/json" },
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) throw new Error(`process-batch failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

(No automated test runner is configured for `mobile/` — this matches the existing project convention where mobile code is verified manually via `npx expo start`, not unit tests.)

- [ ] **Step 4: Commit**

```bash
git add lib/adminApi.ts package.json package-lock.json
git commit -m "feat: add mobile admin API client and PIN storage"
```

(run from `mobile/`)

---

## Task 9: Mobile — admin screen

**Files:**
- Create: `mobile/src/app/admin/index.tsx`
- Modify: `mobile/src/app/index.tsx` (add entry link)

**Interfaces:**
- Consumes: everything from Task 8's `mobile/src/lib/adminApi.ts`
- Consumes: `colors`, `typography`, `spacing`, `radius` from `@/theme/tokens` (existing tokens, no new ones needed — matches the style already used in `InsightFilters.tsx`/`statement/[id].tsx`)

- [ ] **Step 1: Create the admin screen**

```typescript
// mobile/src/app/admin/index.tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import {
  loadPin,
  savePin,
  verifyPin,
  checkNewMeetings,
  scrapeMeeting,
  processBatch,
  type ScrapedMeetingSummary,
} from "@/lib/adminApi";
import { colors, typography, spacing, radius } from "@/theme/tokens";

const POLL_INTERVAL_MS = 4000;
const BATCH_LIMIT = 5;

export default function AdminScreen() {
  const [pin, setPin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [newMeetings, setNewMeetings] = useState<ScrapedMeetingSummary[] | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, excluded: 0, failed: 0, remaining: 0 });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPin().then(setPin);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  async function submitPin() {
    const ok = await verifyPin(pinInput);
    if (!ok) {
      setPinError(true);
      return;
    }
    await savePin(pinInput);
    setPin(pinInput);
  }

  async function handleCheck() {
    if (!pin) return;
    setChecking(true);
    try {
      setNewMeetings(await checkNewMeetings(pin));
    } finally {
      setChecking(false);
    }
  }

  async function handleScrape(meeting: ScrapedMeetingSummary) {
    if (!pin) return;
    setScrapingId(meeting.sourceMeetingId);
    try {
      await scrapeMeeting(pin, meeting);
      setNewMeetings((prev) => (prev ? prev.filter((m) => m.sourceMeetingId !== meeting.sourceMeetingId) : prev));
    } finally {
      setScrapingId(null);
    }
  }

  async function pollOnce() {
    if (!pin) return;
    const result = await processBatch(pin, BATCH_LIMIT);
    setProgress((prev) => ({
      processed: prev.processed + result.processed,
      excluded: prev.excluded + result.excluded,
      failed: prev.failed + result.failed,
      remaining: result.remaining,
    }));
    if (result.remaining > 0) {
      pollTimer.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
    } else {
      setProcessing(false);
    }
  }

  function startProcessing() {
    setProgress({ processed: 0, excluded: 0, failed: 0, remaining: 0 });
    setProcessing(true);
    pollOnce();
  }

  function stopProcessing() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setProcessing(false);
  }

  if (!pin) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>관리자 PIN</Text>
        <TextInput
          style={styles.pinInput}
          value={pinInput}
          onChangeText={(v) => {
            setPinInput(v);
            setPinError(false);
          }}
          secureTextEntry
          keyboardType="number-pad"
          placeholder="PIN 입력"
        />
        {pinError && <Text style={styles.error}>잘못된 PIN입니다</Text>}
        <Pressable style={styles.button} onPress={submitPin}>
          <Text style={styles.buttonLabel}>확인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>신규 회의 체크</Text>
      <Pressable style={styles.button} onPress={handleCheck} disabled={checking}>
        {checking ? <ActivityIndicator color={colors.background.normal} /> : <Text style={styles.buttonLabel}>체크하기</Text>}
      </Pressable>

      {newMeetings && newMeetings.length === 0 && <Text style={styles.body}>신규 회의 없음</Text>}
      {newMeetings?.map((m) => (
        <View key={m.sourceMeetingId} style={styles.meetingRow}>
          <Text style={styles.body}>{m.title}</Text>
          <Pressable style={styles.smallButton} onPress={() => handleScrape(m)} disabled={scrapingId === m.sourceMeetingId}>
            {scrapingId === m.sourceMeetingId ? (
              <ActivityIndicator color={colors.background.normal} />
            ) : (
              <Text style={styles.buttonLabel}>스크래핑</Text>
            )}
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>발언 처리</Text>
      {processing ? (
        <>
          <Text style={styles.body}>
            {progress.processed + progress.excluded + progress.failed}건 처리됨 (제외 {progress.excluded}, 실패 {progress.failed}) · 남음 {progress.remaining}
          </Text>
          <Pressable style={styles.button} onPress={stopProcessing}>
            <Text style={styles.buttonLabel}>일시정지</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.button} onPress={startProcessing}>
          <Text style={styles.buttonLabel}>처리 시작</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[16], backgroundColor: colors.background.normal, gap: spacing[8] },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing[16], gap: spacing[8], backgroundColor: colors.background.normal },
  title: { ...typography.title3, color: colors.label.normal },
  sectionTitle: { ...typography.label1, color: colors.label.normal, marginTop: spacing[12] },
  body: { ...typography.body2, color: colors.label.neutral },
  error: { ...typography.label2, color: colors.status.negative },
  pinInput: {
    borderWidth: 1,
    borderColor: colors.line.solid,
    borderRadius: radius.full,
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[8],
    minWidth: 160,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primary.normal,
    borderRadius: radius.full,
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[12],
    alignItems: "center",
  },
  smallButton: {
    backgroundColor: colors.primary.normal,
    borderRadius: radius.full,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[10],
  },
  buttonLabel: { ...typography.label2, color: colors.background.normal },
  meetingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
```

- [ ] **Step 2: Add an entry point from the main screen**

In `mobile/src/app/index.tsx`, add the import:

```typescript
import { Link } from "expo-router";
```

and add a link inside `ListHeaderComponent`'s `<InsightFilters .../>` block, right after it (still inside the same `View`/fragment returned by `ListHeaderComponent`— wrap both in a `<>...</>` if not already):

```typescript
ListHeaderComponent={
  <>
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
    <Link href="/admin" style={styles.adminLink}>
      <Text style={styles.adminLinkText}>관리자</Text>
    </Link>
  </>
}
```

Add to the `styles` object at the bottom of `index.tsx`:

```typescript
adminLink: { alignSelf: "flex-end", paddingHorizontal: spacing[12], paddingVertical: spacing[4] },
adminLinkText: { ...typography.label2, color: colors.label.alternative },
```

(`typography` is already imported in this file's sibling `InsightFilters.tsx`; add it to `index.tsx`'s existing `import { colors, spacing } from "@/theme/tokens";` line so it reads `import { colors, spacing, typography } from "@/theme/tokens";`.)

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual QA**

```bash
cd mobile && npx expo start
```

Walk through: tap "관리자" on the main screen → wrong PIN shows the error message → correct PIN (matching the backend's `ADMIN_PIN`) enters the admin screen → "체크하기" shows either "신규 회의 없음" or a list with working "스크래핑" buttons → "처리 시작" shows the progress line updating every ~4s and stops automatically at 0 remaining, or on "일시정지".

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/index.tsx src/app/index.tsx
git commit -m "feat: add mobile admin screen for new-meeting check and processing"
```

(run from `mobile/`)

---

## Self-Review Notes

- **Spec coverage:** All three API endpoints (Task 5–7), PIN guard (Task 4), serverless Chromium (Task 1, blocking dependency for Tasks 5–6), shared logic extraction for both scrape and pipeline (Tasks 2–3), mobile screen + entry point (Task 8–9) are covered. DB schema explicitly unchanged, per spec's Non-Goals.
- **Known pre-existing gap outside this plan's scope:** `mobile/src/lib/api.ts`, `InsightCard.tsx`, `InsightFilters.tsx`, `index.tsx`, and `statement/[id].tsx` still reference the old 5-axis field names (`learningLevel`, `geojeImpactScore`, etc.) and the old `minGeojeImpact` query param, which no longer match `/api/insights`'s current 8-axis response shape. This predates this plan (it's a gap from the earlier 8-axis backend migration never reaching the mobile UI) and is unrelated to the admin feature — flagged here so it isn't mistaken for something this plan was supposed to fix.
