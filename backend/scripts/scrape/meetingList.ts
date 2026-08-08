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
