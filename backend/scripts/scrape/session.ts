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
    },
  });
  return res.json();
}
