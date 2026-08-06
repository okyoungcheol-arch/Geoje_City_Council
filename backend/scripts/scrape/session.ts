// backend/scripts/scrape/session.ts
import { chromium, type Browser, type Page } from "playwright";

export interface CouncilSession {
  page: Page;
  csrfToken: string;
}

export async function openCouncilSession(): Promise<{ browser: Browser; session: CouncilSession }> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("https://www.gjcl.go.kr/kr/minutes/committee.do");
  const csrfToken = await page.locator("meta#csrf").getAttribute("content");
  if (!csrfToken) throw new Error("CSRF token not found on /kr/minutes/committee.do");
  return { browser, session: { page, csrfToken } };
}

export async function postAsync<T>(
  session: CouncilSession,
  path: string,
  form: Record<string, string | number>
): Promise<T> {
  const res = await session.page.request.post(`https://www.gjcl.go.kr/minutes/async/${path}`, {
    form,
    headers: {
      "X-CSRF-TOKEN": session.csrfToken,
      "X-Requested-With": "XMLHttpRequest",
      // The live server 500s on these endpoints without a same-origin Referer (confirmed
      // during Task 6 live validation on 2026-08-06) — browsers send this automatically,
      // but Playwright's page.request.post does not, so it must be set explicitly here.
      "Referer": "https://www.gjcl.go.kr/kr/minutes/committee.do",
    },
  });
  return res.json();
}
