// backend/scripts/scrape/minutes.ts
import { chromium } from "playwright";
import * as cheerio from "cheerio";

export interface ScrapedStatement {
  memberName: string;
  agendaTitle: string | null;
  orderInMeeting: number;
  rawText: string;
}

function isFreeSpeechAgenda(title: string | null): boolean {
  if (!title) return false;
  return /5\s*분\s*자유\s*발언/.test(title);
}

export function parseMinutesHtml(html: string): ScrapedStatement[] {
  const $ = cheerio.load(html);
  const statements: ScrapedStatement[] = [];
  let order = 0;
  let currentAgenda: string | null = null;

  // NOTE: the real fixture nests .contents-block turns one level deeper than the spike's
  // findings.md diagram implied — under #minutes-body, not directly under #minutes
  // (#minutes also contains #minutes-header/#agenda-block/#item-block siblings before it).
  // Confirmed against backend/scripts/scrape/__fixtures__/viewer-minutes-uid5236.html.
  $("#minutes-body > .contents-block").each((_, el) => {
    const $el = $(el);

    const $itemHeader = $el.find(".item-in-contents").first();
    if ($itemHeader.length > 0) {
      currentAgenda = $itemHeader.attr("title")?.trim() || $itemHeader.text().trim();
      return; // agenda-item header, not a statement
    }

    if (!$el.hasClass("speaker-block")) {
      // standalone procedural line (timestamps, recess: e.g. <p class="taged-line">),
      // or any other non-turn content — not a statement. Checked via speaker-block
      // membership rather than presence of .taged-line, because a real speaker turn
      // can itself contain an embedded .taged-line audience reaction mid-speech
      // (e.g. "(“예” 하는 의원 있음)") — confirmed in the real fixture at
      // data-con_idx="27/29/35/39/41" — and must still be captured as a statement.
      return;
    }

    if (isFreeSpeechAgenda(currentAgenda)) {
      return; // 5분자유발언 — excluded from this project's scope
    }

    const $strong = $el.children("strong").first();
    const linkText = $strong.find("a").text().trim();
    const memberName = linkText || $strong.text().replace(/^○/, "").trim();

    const rawText = $el
      .clone()
      .children("strong")
      .remove()
      .end()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (!memberName || !rawText) return;

    statements.push({ memberName, agendaTitle: currentAgenda, orderInMeeting: order++, rawText });
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
