# gjcl.go.kr spike findings (Task 3)

Investigated live with headless Playwright (`chromium.launch()`, default headless) on
2026-08-06. All requests captured below are real, observed responses from
`www.gjcl.go.kr` — no fields are guessed or synthesized. Fixture files referenced below
are saved at `backend/scripts/scrape/__fixtures__/`.

**Important correction to the task brief's assumption:** `/kr/cast/plenary.do` (the URL
named in Step 1 of the brief) is the **video** minutes page ("영상회의록") — its title is
literally `본회의 > 영상회의록 > 거제시의회`, and every meeting-detail link on it
(`/viewer/video/minutes/{uid}.do?pos=N`) opens the video player at a timestamp. Since
video is explicitly out of scope, that page is a dead end for this project. The site has
a **separate, non-video "회의록" (minutes-text) section** that is the actual target for
Tasks 4–5: `/kr/minutes/committee.do` ("회의별" = by-meeting), `/kr/minutes/session.do`
("회차별" = by-round), `/kr/minutes/year.do` ("연도별" = by-year). This spike used
`/kr/minutes/committee.do`, which is the most direct path to "제10대 + 본회의".
`plenary.do` is still useful for one thing: it's where you'd confirm which committee
code / round is "current", but no video-related requests should be replicated.

## 1. Page structure: `/kr/minutes/committee.do`

Loading this page renders a jsTree widget (`#minutes_tree`, using the `vakata-jstree`
plugin) with **no `<select>` elements at all** — category/round/session selection is a
lazy-loaded tree, not a form+dropdown+submit flow. Each tree level is fetched via a POST
to a distinct `*.do` endpoint under `/minutes/async/`, triggered by clicking a node
(`page.click("#<nodeId>_anchor")`). Every level requires the level above's identifiers as
form params. All confirmed real request/response pairs, in order, for 제10대 + 본회의:

### Level 0 — page load
`GET https://www.gjcl.go.kr/kr/minutes/committee.do`
(no query params needed to reach the base tree UI)

### Level 1 — categories (committee types)
```
POST https://www.gjcl.go.kr/minutes/async/committeeRoot.do
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-CSRF-TOKEN: <token from <meta id="csrf" content="...">>
X-Requested-With: XMLHttpRequest

Body: cl_cd=CT
```
Response (`application/json;charset=utf-8`, saved at
`scripts/scrape/__fixtures__/committeeRoot.CT.json`):
```json
[
  {"id":"CT-A","text":"본회의", "data":{"cl_cd":"CT","cmt_cd":"A"}, "children": true},
  {"id":"CT-C","text":"상임위원회", "data":{"cl_cd":"CT","cmt_cd":"C"}, "children": true},
  {"id":"CT-E","text":"예산결산특별위원회", "data":{"cl_cd":"CT","cmt_cd":"E"}, "children": true},
  {"id":"CT-G","text":"특별위원회", "data":{"cl_cd":"CT","cmt_cd":"G"}, "children": true},
  {"id":"CT-J","text":"행정사무감사", "data":{"cl_cd":"CT","cmt_cd":"J"}, "children": true},
  {"id":"CT-L","text":"행정사무조사", "data":{"cl_cd":"CT","cmt_cd":"L"}, "children": true}
]
```
**본회의 (plenary) = `cmt_cd=A`.** Note this is a *different code namespace* than the
video system's `cmt_cd=A011` seen on `plenary.do` — do not mix the two.

### Level 2 — 대수 (assembly terms) for a category
```
POST https://www.gjcl.go.kr/minutes/async/th.do
Body: cl_cd=CT&cmt_cd=A
```
Response (saved at `scripts/scrape/__fixtures__/th.CT-A.json`) is a JSON array with one
entry per 대, e.g.:
```json
{"id":"CT-10-A","text":"제10대 의회 (2026. 7. 1 ~ 2030. 6. 30 : 제263회 ~ )",
 "data":{"cl_cd":"CT","cmt_cd":"A","th":10}}
```
**제10대 = `th=10`** (confirmed numeric, matches the `th_sch` select's `value="10"` seen
separately on `plenary.do`).

### Level 3 — 회기 (session/round) list — THE MEETING LIST REQUEST
```
POST https://www.gjcl.go.kr/minutes/async/session.do
Body: cl_cd=CT&th=10&cmt_cd=A
```
Response (saved at `scripts/scrape/__fixtures__/session.CT-A-th10.json`), real body as
captured 2026-08-06:
```json
[
  {"id":"CT-10-0264-A","text":"제264회 [임시회] (2026. 07. 20. ~ 2026. 07. 31.)",
   "data":{"cl_cd":"CT","cmt_cd":"A","th":10,"session":264}},
  {"id":"CT-10-0263-A","text":"제263회 [임시회] (2026. 07. 01. ~ 2026. 07. 03.)",
   "data":{"cl_cd":"CT","cmt_cd":"A","th":10,"session":263}}
]
```
This is **the exact request that "lists meetings for 제10대 + a given category"**:
`POST /minutes/async/session.do` with `cl_cd`, `th`, `cmt_cd`. It returns 회기 (a
multi-day sitting, e.g. "제264회 임시회"), not individual meeting dates yet — that's one
level deeper.

### Level 4 — individual meeting documents within a 회기
```
POST https://www.gjcl.go.kr/minutes/async/minutes.do
Body: cl_cd=CT&th=10&session=264&cmt_cd=A
```
Response (saved at `scripts/scrape/__fixtures__/minutes.CT-A-th10-session264.json`), real
body:
```json
[
  {"id":"minutes-5237","text":"[임시회의록] 개회식(2026.07.20.월요일)",
   "a_attr":{"title":"거제시의회 제10대 제264회[임시회] 본회의 개회식 회의록(새창열림)"},
   "data":{"uid":5237,"publish":"T","is_minutes":true}},
  {"id":"minutes-5236","text":"[임시회의록] 제1차(2026.07.20.월요일)",
   "a_attr":{"title":"거제시의회 제10대 제264회[임시회] 본회의 제1차 회의록 ..."},
   "data":{"uid":5236,"publish":"T","is_minutes":true}},
  {"id":"minutes-5242","text":"[임시회의록] 제2차(2026.07.31.금요일)",
   "a_attr":{"title":"거제시의회 제10대 제264회[임시회] 본회의 제2차 회의록 ..."},
   "data":{"uid":5242,"publish":"T","is_minutes":true}}
]
```
Each leaf has a `uid` — the identifier for the actual minutes document — and
`publish:"T"` (there may be unpublished/`"F"` documents; worth filtering on this field).
A 회기 (round) can produce multiple documents: one per sitting/차 (제1차, 제2차, ...) plus
sometimes a separate "개회식" (opening ceremony) document. **5-minute free speeches
(5분자유발언) are NOT separate documents** — they're embedded as ordinary speaker turns
inside the 차 (sitting) document that contains them (confirmed by reading the uid=5236
content directly, see below).

**Auth notes for these 4 endpoints:** all are POSTs requiring an `X-CSRF-TOKEN` header
(value comes from `<meta id="csrf" name="_csrf" content="...">` on the just-loaded HTML
page) and `X-Requested-With: XMLHttpRequest`; they're same-origin AJAX calls, not
independently reachable without first loading a page on the site to get a valid CSRF
token + session cookie. A cold cross-origin `fetch()` from a blank page failed outright
(confirmed). **Practical implication for the scraper (Tasks 4–5): load
`/kr/minutes/committee.do` once with Playwright to establish a session + CSRF token,
then either (a) keep clicking the jsTree nodes with `page.click`, or (b) issue the same
POSTs via `page.request.post(url, {form: {...}, headers: {"X-CSRF-TOKEN": token}})` in
the same browser context to skip the click choreography — (b) is faster and was not
blocked when tested from within an already-loaded page's context.**

## 2. Meeting detail / minutes text: server-rendered HTML, single GET, no login

Clicking a leaf node (e.g. `minutes-5236`, title ends in "새창열림" = "opens in new
window") opens a **new tab** via `window.open`, landing on:

```
GET https://www.gjcl.go.kr/viewer/minutes.do?uid=5236
```

**Confirmed this URL is directly navigable in a fresh, cookie-less browser context** (no
need to replay the tree-click flow, no CSRF token needed for this GET) — tested by
launching a brand-new `chromium` instance and going straight to
`https://www.gjcl.go.kr/viewer/minutes.do?uid=5236`; it returned HTTP 200 with the full
85KB of minutes HTML (byte-for-byte the same as the value obtained via the click flow).
This means Task 4/5's scraper only needs the `uid` values discovered from
`/minutes/async/minutes.do` — it does not need to keep a session alive to fetch each
document.

The page shows a `"회의록을 불러오는 중입니다"` ("loading the minutes...") placeholder in
the raw template, but **this is never actually used as a separate AJAX round-trip** — by
the time `page.content()` was read (even right after `waitForLoadState("networkidle")`),
no additional XHR to any minutes-content endpoint had fired; the full text is already
present in the initial HTML response body. Confirmed via a dedicated request/response
listener attached directly to the popup page: the only non-asset request it made besides
the initial navigation was a `POST /visitant/log.do` analytics beacon — nothing
minutes-related. **Conclusion: minutes text is 100% server-rendered HTML in the initial
GET response. There is no separate AJAX/JSON minutes-content endpoint, and no
downloadable PDF/HWP file was found anywhere on the page** (`grep`-checked for
`.hwp`/`.pdf`/`다운로드`/`첨부파일` — zero matches).

The rendered page also carries a legal-status banner worth preserving for provenance:
`[본 회의록은 최종 교정 전 임시회의록이므로 법적 효력이 없습니다.]` ("this record is a
provisional transcript before final proofreading and has no legal effect") — at least
some documents are marked provisional; a finalized version presumably replaces this
banner later. Not verified whether finalized docs keep the same `uid` or get a new one —
out of scope for this spike since 제10대's first session is only ~1 month old as of
2026-08-06 and no finalized minutes exist yet to compare against.

Full captured page saved at `scripts/scrape/__fixtures__/viewer-minutes-uid5236.html`.

## 3. Minutes text structure and per-speaker attribution

**Highly structured, parseable HTML — not raw prose.** Container hierarchy on
`/viewer/minutes.do?uid=N`:

```html
<div class="container" id="minutes_print">
  <div class="content no-animate" id="minutes_top">
    <div class="content-wrapper" id="canvas">
      <div id="minutes">
        <div id="minutes-header"> ... session/title/date metadata ... </div>
        <ol id="agenda-block"> ... 의사일정 (agenda outline) list ... </ol>
        <ol id="item-block"> ... 부의된 안건 (referred items), links to #item1, #item2, ... </ol>
        <hr>
        <!-- CORRECTED (Task 5): contents-block divs are NOT direct children of #minutes —
             they're nested one level deeper, inside this #minutes-body wrapper, which sits
             after #item-block as a sibling of #minutes-header/#agenda-block/#item-block.
             A parser scoping its selector to "#minutes > .contents-block" (as originally
             assumed here) matches zero elements against the real page; it must be
             "#minutes-body > .contents-block" instead. Confirmed directly against
             backend/scripts/scrape/__fixtures__/viewer-minutes-uid5236.html — see
             backend/scripts/scrape/minutes.ts and task-5-report.md for detail. -->
        <div id="minutes-body">
          <!-- a flat sequence of contents-block divs, one per "turn": -->
          <div class="contents-block" data-con_idx="0">
            <p class="taged-line tag-R">(10시 09분  개의)</p>
          </div>
          <div class="contents-block speaker-block member-speech"
               data-con_idx="1" data-member_code="08080">
            <strong>○의장 <a class="member_profile btn_profile" id="btn_profile_182"
               href="#profile_layer_popup" data-uid="182"
               title="안석봉 의원 프로필 보기">안석봉</a></strong>
            &nbsp;&nbsp;성원이 되었으므로 제264회 거제시의회 임시회 제1차 본회의를
            개의하겠습니다.<br>
            &nbsp;&nbsp;의회사무국장으로부터 집회보고 ...
          </div>
          <div class="contents-block" data-con_idx="4">
            <strong class="item-in-contents" id="item1"
               title="○5분 자유발언(이미숙·추인호·최양희·김동수·김영규 의원)">
               ○5분 자유발언(...)</strong>
          </div>
          <div class="contents-block speaker-block member-speech"
               data-con_idx="12" data-member_code="08030">
            <strong>○<a class="member_profile btn_profile" id="btn_profile_183"
               href="#profile_layer_popup" data-uid="183"
               title="김동수 의원 프로필 보기">김동수</a> 의원</strong>
            &nbsp;&nbsp;주제: 공공시설 용지 환매권 관리 강화와 시민 혈세 낭비 대책 촉구<br>
            ...
          </div>
          <div class="contents-block speaker-block" data-con_idx="2" data-member_code="">
            <strong>○사무국장 직무대리 윤병삼</strong>
            &nbsp;&nbsp;의회사무국장 직무대리 윤병삼입니다. ...
          </div>
          <!-- also confirmed (Task 5): a genuine speaker turn can itself contain an embedded
               taged-line audience reaction mid-speech (not just as its own standalone block),
               e.g. data-con_idx="41" — a parser must classify by .speaker-block membership,
               not by mere presence/absence of a nested .taged-line, or it will silently drop
               legitimate statements (5 turns were dropped this way while building minutes.ts
               before the check order was fixed; see task-5-report.md). -->
        </div>
      </div>
    </div>
  </div>
</div>
```

Key attributes for a parser (all confirmed present in the real, saved fixture
`viewer-minutes-uid5236.html`):

- Every "turn" of the transcript is one `<div class="contents-block" data-con_idx="N">`,
  in document order (`data-con_idx` is a monotonically increasing integer — good sort
  key / stable ID within a document).
- **Speaker turns** additionally carry `speaker-block` (and, when the speaker is a
  council member with a profile, also `member-speech`) plus
  `data-member_code="NNNNN"` (a 5-digit internal member code, e.g. `"08080"` for the
  회의장/chair 안석봉, `"08030"` for 김동수). The speaker's role + name is in a leading
  `<strong>` tag: `○의장 <a data-uid="182" title="안석봉 의원 프로필 보기">안석봉</a>`
  or `○김동수 위원 <a data-uid="183" ...>김동수</a>`. The `<a>` link's `data-uid` is a
  **separate ID space from `data-member_code`** (site-wide member/profile ID vs. a
  per-document/role code) — both are useful: `data-uid` is stable across documents,
  `data-member_code` is a shorter internal code also present on turns.
- Non-member speakers (staff, e.g. "사무국장 직무대리 윤병삼") get `speaker-block` but
  **no** `member-speech` class, **no** `<a>` link, and `data-member_code=""` (empty) —
  just a plain-text name inside `<strong>`. A parser must handle this "unlinked speaker"
  case, not assume every turn has a `data-uid`.
- The speech text itself is everything after the closing `</strong>` up to the next
  `contents-block` div, with `&nbsp;` for indentation and literal `<br>` tags for
  paragraph/line breaks inside a single turn (no nested block markup).
- Procedural/stage-direction lines (timestamps, recesses) are plain
  `<div class="contents-block" data-con_idx="N"><p class="taged-line tag-R">(10시 09분
  개의)</p></div>` — no speaker, easily distinguished by the `taged-line` class and
  absence of `speaker-block`.
- Agenda-item headers within the transcript flow are
  `<div class="contents-block" data-con_idx="N"><strong class="item-in-contents"
  id="itemK" title="...">...</strong></div>` — also speaker-less, distinguished by
  `item-in-contents` and an `id="item1"`/`"item2"`/... matching the `#item-block` TOC
  anchors at the top of the page.

**Bottom line for Task 4/5:** minutes text is attributed per-speaker in a reliably
parseable way. A scraper can iterate `.contents-block` divs in order and classify each
as: (a) procedural (`.taged-line`), (b) agenda-item header (`.item-in-contents`), or
(c) speaker turn (`.speaker-block`) — and for (c), extract `data-member_code`, the
optional `data-uid` from the nested `<a>`, the displayed name, and the role prefix
(의장/위원/의원/etc. before or after the name) separately from the speech text that
follows.

## 4. Fixtures saved (for Task 4/5, avoids re-hitting the live site)

All under `backend/scripts/scrape/__fixtures__/`:

- `committeeRoot.CT.json` — categories tree level (본회의/상임위원회/... for `cl_cd=CT`).
- `th.CT-A.json` — 대수 tree level for 본회의 (`cmt_cd=A`).
- `session.CT-A-th10.json` — 회기 (round) list for 제10대 본회의; **this is the "list
  meetings" response** the brief asked about.
- `minutes.CT-A-th10-session264.json` — individual document list (with `uid`s) for
  제264회 [임시회].
- `viewer-minutes-uid5236.html` — full real minutes document HTML (제264회 제1차 본회의),
  the fixture to use for writing/testing the speaker-attribution parser.

## 5. Politeness / process notes

- All requests were made with default headless `chromium.launch()` — no `headless:
  false`.
- A minimum ~1.5s `sleep()` was inserted between every navigation/click step across all
  spike scripts (`inspect-site.ts` through `inspect-site-9.ts`); no concurrent/parallel
  requests were issued at any point.
- No video *player/stream* was ever loaded, and no video URL/response was committed
  anywhere in this repo — but for accuracy: `/kr/cast/plenary.do` was navigated to
  **twice**, not once. `inspect-site.ts` (the brief's own Step-1 script) loaded it once
  to dump the page's `<form>`/`<select>` markup. `inspect-site-2.ts` ("Step 1b") loaded
  it a **second** time with `waitUntil: "networkidle"`, and that second visit
  deliberately attached a `page.on("response")` listener that captured and wrote to
  disk the full response bodies of the page's own on-load video-cast XHRs —
  `POST /kr/cast/loadOrderList.do` and `POST /kr/cast/loadAgendaList.do` — in order to
  read what they returned. That was an active capture of video-cast-endpoint content,
  not merely a passive observation that the requests fired. No video file, stream, or
  `/viewer/video/*` URL was ever requested, played, or saved, and nothing from these two
  visits was kept as a committed fixture (the raw dumps were deleted before commit; only
  the non-video `/kr/minutes/*` fixtures under `scripts/scrape/__fixtures__/` were kept).
  Both `plenary.do` visits happened before `inspect-site-3.ts` pivoted to the correct,
  non-video `/kr/minutes/committee.do` flow, and `plenary.do` was not revisited after
  that pivot.
- No CAPTCHA, IP block, or login wall was encountered anywhere in this spike; the site
  is a standard server-rendered Korean municipal site (Spring-based, CSRF meta tags,
  jQuery/jsTree UI) with plain-HTTP-reachable content.
