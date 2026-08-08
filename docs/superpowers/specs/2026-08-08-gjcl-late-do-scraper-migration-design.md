# 스크래퍼 소스 교체(late.do) + 부의된 안건 게이트 Design Spec

**Date:** 2026-08-08
**Status:** Approved (native Claude Code plan mode에서 사용자 승인, 승인된 계획 원본: `C:\Users\admin\.claude\plans\https-www-gjcl-go-kr-kr-cast-plenary-do-kind-fox.md`)

## Problem

스크래퍼는 지금 `https://www.gjcl.go.kr/kr/minutes/committee.do` 기반 4단계 CSRF 트리(committeeRoot.do → th.do[미사용] → session.do → minutes.do)로 회의 목록을 수집한다. 사용자가 언급한 `cast/plenary.do`는 프로덕션 스크래퍼가 쓴 적이 없는 URL이다 — 스파이크 조사(`backend/scripts/spike/findings.md`)에서 "영상회의록"(비디오) 페이지로 확인되어 이미 폐기됐고(영상 기능 전면 금지 규칙상 애초에 쓸 수 없음), 실제 접속으로도 재확인했다.

대신 `https://www.gjcl.go.kr/kr/minutes/late.do`를 직접 테스트해 CSRF 없는 단순 GET 페이지네이션으로 회의 문서 목록을 가져올 수 있음을 확인했고, 실제 HTML을 fixture로 캡처(`backend/scripts/scrape/__fixtures__/late-do-page1.html`)해 정확한 테이블 구조를 확보했다. 또한 "부의된 안건이 있는 회의만 평가"를 위해, 스크래퍼가 이미 5분자유발언 섹션을 전부 버리고 있어 `agendaItems` 테이블 0건 = 부의된 안건 없음과 동치임을 코드로 확인했다.

## Goal

1. 회의 목록 수집을 late.do 기반으로 교체하고, CSRF 트리(session.ts) 전체를 제거한다.
2. 제10대 데이터만 수집되도록 보장한다 — `th_sch=10` 쿼리 파라미터에만 의존하지 않는다(아래 "중요 발견" 참조).
3. 부의된 안건이 없는 회의(개회식 등)를 `getInsightRows()` 결과에서 제외한다.

## Non-Goals

- 이미 스크랩된 데이터의 재처리/백필 트리거는 이번 범위 밖이다(코드 변경 후 `run.ts`를 수동 실행하는 것은 운영 작업이며 이 계획의 구현 태스크가 아니다 — Task 8에서 다룬다).
- 부의안건 텍스트 자체를 UI에 새로 노출하는 것은 범위 밖이다(게이트링에만 사용).

## 중요 발견 (설계 확정 후 실제 fixture 캡처로 발견 — 원 계획 대비 수정 사항)

**`th_sch=10` 쿼리 파라미터는 사이트의 전체 페이지 범위(444페이지, 4,439건, 전 대수 통합 일련번호)에 걸쳐 신뢰할 수 없다.** 실측 결과:
- page=1: 전부 제10대 ✅
- page=5, page=9, page=10, page=30, page=50: 전부 제9대 (필터가 이미 깨짐)
- page=100: 제8대, page=444("마지막 페이지"라고 사이트 자신이 링크하는 페이지)·page=445: 전부 제1대(1991년!)

즉 사이트의 페이지네이션 총 개수(444)는 `th_sch` 필터와 무관하게 전체 데이터 기준으로 고정되어 있고, 실제로 제10대 데이터만 정확히 필터링되는 구간은 앞쪽 몇 페이지(정확한 경계는 페이지 2~4 사이 어딘가 — 제10대 임기가 막 시작되어 문서 수 자체가 적기 때문)뿐이다.

**대응**: 스크래퍼는 쿼리 파라미터를 신뢰하지 않고, **각 행의 "대수" 컬럼 값을 직접 검사**해 `"제10대"`가 아닌 행은 절대 저장하지 않는다. 페이지네이션 종료 조건도 "빈 페이지"가 아니라 **"해당 페이지에 제10대 행이 하나도 없음"**으로 정의한다(최신순 정렬이므로, 한 페이지가 전부 구세대면 이후 페이지도 전부 구세대).

## Verified HTML Structure (fixture: `backend/scripts/scrape/__fixtures__/late-do-page1.html`)

```html
<table class="normal_list">
  <thead><tr><th>번호</th><th>대수</th><th>회수</th><th>차수</th><th>회의명</th><th>일자</th></tr></thead>
  <tbody>
    <tr>
      <td>4439</td>
      <td>제10대</td>
      <td>제264회</td>
      <td>제2차</td>
      <td class="sbj"><a href="/viewer/minutes.do?uid=5242"
          title="거제시의회 제10대  제264회[임시회] 본회의 제2차 회의록
○5분 자유발언(...)
1. 2026년도 제1회 추가경정 세입·세출 예산안
2. 제2항 2026년도 거제시 기금운용계획 제7차 변경안"
          target="_blank" title="새창열림">본회의<br/>[<span class="blue">임시회의록</span>]</a></td>
      <td>2026.07.31</a></td>
    </tr>
    ...
  </tbody>
</table>
```

- `<a>`에 `title` 속성이 **중복 선언**되어 있다(HTML 스펙 위반이지만 실사이트가 그렇다) — 첫 번째 값(전체 제목 + 부의안건 목록 개행 텍스트)이 파서가 실제로 노출하는 값이고(HTML5 파싱 규칙상 중복 속성은 첫 값 유지), 두 번째("새창열림")는 무시된다. cheerio(parse5 기반)는 이 규칙을 올바르게 따른다.
- 날짜 셀 뒤 `</a>`가 남아있는 등 마크업이 지저분하지만(`<a>`가 `<td>` 경계를 넘어 열려 보임), HTML5 파싱 알고리즘상 `<a>`는 `</td>` 시점에 암묵적으로 닫히므로 cheerio로 파싱하면 문제없다 — **정규식이 아니라 cheerio(DOM)로 파싱해야 하는 이유**이기도 하다.
- 카테고리(`category`)는 `<a>`의 첫 자식 텍스트 노드(`<br/>` 앞부분, 예: "본회의")를 쓴다 — `[임시회의록]` 부분은 `<span>` 안에 있어 첫 텍스트 노드에 포함되지 않는다.
- `uid`는 `href`에서 추출한다(`sourceMeetingId`로 사용 — "번호" 컬럼과는 다른 값이므로 절대 "번호"를 쓰지 않는다. 기존 스크래퍼가 이미 `uid`를 `sourceMeetingId`로 써왔으므로, uid 기준을 유지해야 기존에 스크랩된 회의가 갱신되지 저장되지 중복 삽입되지 않는다).
- 개회식처럼 부의안건이 없는 문서는 `title` 속성에 부가 목록 없이 순수 제목만 담긴다(예: `uid=5237`, "...본회의 개회식 회의록") — `agendaItems` 0건 게이트와 정확히 대응되는 것으로 재확인됨.

## Architecture

```
late.do?...&th_sch=10&page=N (GET, Playwright page.goto, CSRF 불필요)
   → parseLateDoHtml(html) → 각 행에서 "대수"==="제10대"인 것만 ScrapedMeeting[]으로 반환
   → 페이지네이션 루프: 해당 페이지에 제10대 행이 0건이면 종료
   → viewer/minutes.do?uid=N (기존 scrapeMinutes(), 변경 없음)
   → upsertScrapedMeeting() (기존, 변경 없음 — ScrapedMeeting 필드 그대로 유지)

getInsightRows()
   → 기존 3명 미만 회의 제외 게이트 (변경 없음)
   → 신규: agendaItems 0건인 meetingId 제외 게이트 (병렬 쿼리, JOIN 아님 — 중복 방지)
```

## 파일별 변경 (요약 — 상세는 구현 plan 문서 참조)

- `backend/scripts/scrape/meetingList.ts` — 전면 재작성 (`parseLateDoHtml`, `scrapeLateDoPage`; 대수 검증 포함)
- `backend/scripts/scrape/session.ts` — 삭제 (사용처 없음, grep 확인됨)
- `backend/scripts/scrape/run.ts` — 페이지네이션 루프 재구성 (대수-기반 종료 조건)
- `backend/app/api/admin/check-new-meetings/route.ts` — 재구성 + 조기 종료(이미 알려진 회의만 있는 페이지에서 중단)
- `backend/lib/queries/insights.ts` — `agendaItems` 게이트 추가 (`meetingId` 필드 신규 노출)
- 테스트: `meetingList.test.ts`(재작성, 실 fixture 기반), `insights.test.ts`(게이트 케이스 추가), `check-new-meetings/route.test.ts`(mock 재작성 + 조기종료 테스트)
- 문서: 루트 `CLAUDE.md`, `docs/rubric/CLAUDE.md` §1.1, `harness.md`

## Testing / Verification

1. `parseLateDoHtml`을 실 fixture(`late-do-page1.html`)로 단위 테스트 — 네트워크 없이.
2. `run.ts`를 로컬에서 1~2페이지만 실행해 기존 DB의 회의와 대조.
3. `npx vitest run` 전체 통과.
4. `getInsightRows()` 결과를 게이트 추가 전/후로 비교(개회식류만큼 정확히 감소하는지).
5. 백엔드 배포 후 `/api/insights` 재확인.

## Rollout

이 변경은 `backend/`에만 국한되며 `ScrapedMeeting`/API 응답 필드가 그대로라 `mobile/` 쪽 후속 작업은 없다(단, `getInsightRows()`가 반환하는 회의 수가 줄어드는 가시적 변화는 모바일 화면에 그대로 반영된다 — 의도된 동작).
