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
  let freeSpeechHeaderDetectedInBody = false;

  // NOTE: the real fixture nests .contents-block turns one level deeper than the spike's
  // findings.md diagram implied — under #minutes-body, not directly under #minutes
  // (#minutes also contains #minutes-header/#agenda-block/#item-block siblings before it).
  // Confirmed against backend/scripts/scrape/__fixtures__/viewer-minutes-uid5236.html.
  const $turns = $("#minutes-body > .contents-block");

  // Fail closed, not open: a real minutes document always has turns. If the site
  // restructures #minutes-body (the exact class of bug found while building this parser —
  // see task-5-report.md), silently returning [] would let the pipeline record an
  // empty-but-"successful" meeting instead of surfacing the breakage.
  if ($turns.length === 0) {
    throw new Error(
      "parseMinutesHtml: no .contents-block turns found under #minutes-body — the page " +
        "structure may have changed; refusing to return an empty result silently."
    );
  }

  $turns.each((_, el) => {
    const $el = $(el);

    const $itemHeader = $el.find(".item-in-contents").first();
    if ($itemHeader.length > 0) {
      currentAgenda = $itemHeader.attr("title")?.trim() || $itemHeader.text().trim();
      if (isFreeSpeechAgenda(currentAgenda)) {
        freeSpeechHeaderDetectedInBody = true;
      }
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
      // Deliberate scope choice, not an oversight: we exclude the whole 5분자유발언
      // agenda-section boundary (every turn between this header and the next
      // item-in-contents header), not just the individual member speech turns within
      // it. That also drops the chair's own procedural turns inside the section
      // (e.g. "다음 발언자는 ... 의원입니다" — real fixture con_idx 5,7,9,11,13,...,25).
      // Filtering by turn-role instead (chair vs. member) would let more legitimate
      // content through, but adds real complexity for uncertain benefit, and the
      // section-boundary approach is the safer direction for this project's one hard
      // constraint: 5분자유발언 content must never reach the AI pipeline.
      return;
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

  // Fail-closed tripwire for the project's one hard constraint. The exclusion above relies
  // entirely on an in-body `.item-in-contents` header matching the free-speech regex before
  // the section's turns are reached — `currentAgenda` starts `null` and
  // `isFreeSpeechAgenda(null)` is `false`, so if some future document renders its
  // free-speech section without that exact header shape (different class, omitted header,
  // turns emitted before their header), every turn in it would leak through silently as a
  // normal statement. Cross-check against `#item-block`, the document's independent TOC of
  // agenda items (rendered separately from the in-body headers, e.g.
  // `<a href="#item1" title="○5분 자유발언(...)">`): if the TOC lists a free-speech agenda
  // item but no in-body header was ever detected as matching it, refuse to guess — throw
  // instead of returning statements that might include free speeches.
  const tocHasFreeSpeechItem = $("#item-block a[title]")
    .toArray()
    .some((a) => isFreeSpeechAgenda($(a).attr("title")?.trim() ?? null));

  if (tocHasFreeSpeechItem && !freeSpeechHeaderDetectedInBody) {
    throw new Error(
      "parseMinutesHtml: 5분자유발언 agenda item found in TOC but not detected in body — " +
        "refusing to guess, scrape aborted for this document."
    );
  }

  return statements;
}

export async function scrapeMinutes(meetingUrl: string): Promise<ScrapedStatement[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(meetingUrl);
    await page.waitForLoadState("networkidle");
    const html = await page.content();
    return parseMinutesHtml(html);
  } finally {
    // Always close, even if goto/waitForLoadState/parseMinutesHtml throws — otherwise a
    // failed navigation or a fail-closed parse error above leaks the browser process.
    await browser.close();
  }
}
