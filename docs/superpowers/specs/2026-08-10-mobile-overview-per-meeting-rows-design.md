# 표1 랭킹 화면 — 회의별 랭킹 복원 + 전체의원 랭킹 탭 추가 Design Spec

**Date:** 2026-08-10
**Status:** Approved

## Problem

바로 이전 커밋(`cd4de7a`, `feat(mobile): collapse overview rows per member, show axis weight ranges in header`)에서 개요 탭(`OverviewTab.tsx`)을 의원당 1행으로 합치도록 바꿨다(`groupByMember`로 회의별 대표 발언 점수를 산술평균).

그런데 화면에는 **두 가지 다른 요구**가 공존한다.

1. 전체의원+전체회의를 볼 때도, 특정 의원 하나를 선택했을 때도, 그 의원이 발언한 회의 수만큼 행이 나오는 "회의별" 랭킹이 필요하다(세부항목 탭이 이미 이렇게 동작함).
2. 반대로 의원 하나당 딱 1행으로, 참여한 모든 회의의 점수를 평균한 "전체의원" 랭킹도 별도로 필요하다(`cd4de7a`가 만들려던 것과 같은 형태이지만, 개요 탭을 덮어쓰는 게 아니라 독립된 탭이어야 한다).

즉 `groupByMemberMeeting`(회의별 1행)과 `groupByMember`(의원별 1행, 평균)를 **둘 다** 화면에 살려두되, 서로 다른 탭으로 분리해야 한다.

## Goal

- 상단 제목 "전체 발언 랭킹"을 **"회의별 랭킹"**으로 바꾼다(회의를 선택하지 않은 상태에서 개요/세부항목 탭을 볼 때).
- 개요 탭(`OverviewTab.tsx`)을 `groupByMemberMeeting`(의원×회의 조합당 1행)으로 되돌린다. 같은 의원이 여러 행에 걸쳐 나타날 수 있으므로 **회의** 열을 의원명과 태그 사이에 추가하고, 다른 열처럼 헤더 탭으로 정렬 가능하게 만든다.
- 탭바에 **"전체의원랭킹"** 탭을 3번째로 추가한다. 이 탭을 클릭하면:
  - 상단 필터를 강제로 "전체 의원" + "전체회의"로 리셋한다.
  - `groupByMember`(의원당 1행, 참여 회의들의 대표 발언 점수를 산술평균)를 사용하는 새 화면을 보여준다.
  - 컬럼: 의원명 / 참여회의수 / 태그 / 평가점수(평균) — 4개 모두 헤더 탭으로 정렬 가능(평가점수는 필수 요구사항, 나머지는 기존 두 탭과의 일관성을 위해 동일하게 적용).
  - 상단 제목은 탭에 따라 달라진다 — 이 탭에서는 **"전체의원 랭킹"**.

## Non-Goals

- 세부항목 탭(`ScoreGridTab.tsx`)은 이미 `groupByMemberMeeting` + 회의 열을 쓰고 있으므로 변경하지 않는다. `cd4de7a`에서 추가된 "축 가중치 범위 표시" 기능도 그대로 유지한다.
- "전체의원랭킹" 탭 활성 중에 사용자가 상단 필터(의원 칩/회의 드롭다운)를 다시 조작하는 것을 막지 않는다 — 잠그지 않는다. 필터를 좁히면 그 좁혀진 부분집합에 대해 `groupByMember`가 계산한 결과가 그대로 보인다(개요/세부항목 탭이 `filtered` rows를 그대로 받는 것과 동일한 계약). 탭을 자동으로 개요/세부항목으로 되돌리는 로직은 만들지 않는다.
- "전체의원랭킹" 탭에는 세부항목 탭 같은 축별 채점 그리드나 가중치 각주를 추가하지 않는다.

## Architecture

수정/추가 파일: `mobile/src/lib/api.ts`, `mobile/src/app/index.tsx`, `mobile/src/components/table1/OverviewTab.tsx`, `mobile/src/components/table1/AllMembersRankingTab.tsx`(신규).

### api.ts

- `groupByMemberMeeting`, `groupByMember`, `InsightMemberGroup` **모두 유지**한다(당초 계획과 달리 `groupByMember`를 삭제하지 않는다 — 전체의원랭킹 탭이 그대로 재사용).

### index.tsx

- `Tab` 타입에 `"allMembers"` 추가: `type Tab = "overview" | "scores" | "allMembers"`.
- 탭바에 3번째 버튼 "전체의원랭킹" 추가. 클릭 핸들러는 `setMemberFilter(""); setMeetingFilter(""); setTab("allMembers")`를 한 번에 수행한다.
- 제목/안내문 로직을 탭 우선으로 재구성한다(현재는 `meetingFilter` 유무로만 분기):
  ```
  tab === "allMembers"
    → 제목 "전체의원 랭킹"
    → 안내문 "의원별로 참여한 모든 회의의 평가점수를 산술평균한 값입니다."
  meetingFilter (그리고 tab !== "allMembers")
    → 제목 "표1. {meetingShortTitle(meetingFilter)}"
    → 안내문 없음 (기존과 동일)
  그 외 (tab이 overview/scores, meetingFilter 없음)
    → 제목 "회의별 랭킹"
    → 안내문 "회의를 선택하면 해당 회의의 표1로 전환됩니다." (기존과 동일)
  ```
- 본문 렌더링 분기에 `tab === "allMembers"` 케이스를 추가해 `AllMembersRankingTab`을 렌더링한다. 데이터 없음/로딩 실패 처리는 기존 `overview`/`scores`와 동일한 공통 조건문을 그대로 통과시킨다(`fetchFailed`/`filtered.length === 0` 체크는 탭 종류와 무관하게 먼저 평가됨 — 기존 구조 유지).
- 가중평균 설명문(`weightExplainer`, 상단 고정 텍스트)은 탭과 무관하게 그대로 유지한다 — 세 탭 모두 같은 가중평균 방식으로 계산된 점수를 보여주기 때문.

### OverviewTab.tsx

- `groupByMember` → `groupByMemberMeeting` import로 교체, 정렬/렌더링 대상 타입을 `InsightMemberGroup`에서 `InsightGroup`으로 되돌린다.
- **정렬 필드**: `"member" | "meeting" | "tags" | "score"` (기존 3개 + `meeting` 추가).
  - `member`: `representative.memberName.localeCompare(...)`
  - `meeting`: `meetingSessionTitle(representative.meetingTitle).localeCompare(...)` — 세부항목 탭과 동일한 표시 문자열 기준으로 정렬해 사용자가 보는 텍스트와 정렬 순서가 일치하게 한다.
  - `tags`: `representative.tags.join(", ").localeCompare(...)`
  - `score`: `representative.weightedScore` 숫자 비교
  - 기본 정렬은 기존과 동일하게 `{ field: "score", direction: "desc" }` 유지.
- **헤더 레이블**: `HEADER_LABELS`에 `meeting: "회의"` 추가. 기본 방향은 다른 텍스트 컬럼과 동일하게 `asc`.
- **컬럼 순서/폭**: 의원명(고정 폭) → 회의(고정 폭, `numberOfLines={1}`로 말줄임) → 태그(`flex: 1`) → 평가점수(고정 폭). 회의명 표시는 `meetingSessionTitle()`(`@/lib/axes`, 세부항목 탭·회의 필터 드롭다운에서 이미 쓰는 함수)을 사용한다.
- **keyExtractor**: 의원 1명이 여러 행을 가질 수 있으므로 `group.memberName` 대신 `String(group.representative.statementId)`로 되돌린다.
- **행 클릭 동작**: 기존과 동일하게 `router.push(`/statement/${row.statementId}`)`.

### AllMembersRankingTab.tsx (신규)

- `OverviewTab.tsx`와 같은 표 패턴(`FlatList` + `stickyHeaderIndices={[0]}` + 헤더 탭 정렬)을 그대로 따르되, 데이터 소스는 `groupByMember(rows)` (`InsightMemberGroup[]`).
- **정렬 필드**: `"member" | "meetingCount" | "tags" | "score"`.
  - `member`: `memberName.localeCompare(...)`
  - `meetingCount`: 숫자 비교
  - `tags`: `representative.tags.join(", ").localeCompare(...)`
  - `score`: `averageScore` 숫자 비교
  - 기본 정렬 `{ field: "score", direction: "desc" }`.
- **헤더 레이블**: 의원명 / 참여회의수 / 태그 / 평가점수.
- **컬럼 순서/폭**: 의원명(고정 폭) → 참여회의수(좁은 고정 폭, 우측 정렬, `${meetingCount}회`) → 태그(`flex: 1`) → 평가점수(고정 폭, `averageScore.toFixed(2)`).
- **keyExtractor**: `memberName` (의원당 1행이므로 유일).
- **행 클릭 동작**: `representative.statementId`로 이동 — 기존 `groupByMember`가 고르는 "이 의원의 모든 대표 발언 중 가중평균이 가장 높은 발언"을 그대로 사용.
- 스타일은 `OverviewTab.tsx`의 토큰 사용 패턴(`colors`/`typography`/`spacing`)을 그대로 재사용해 표1 계열 화면 간 시각적 일관성을 유지한다. 새 하드코딩 색상/사이즈를 추가하지 않는다(CLAUDE.md 모바일 UI 스타일 규칙).

## Data

- 표시 문자열은 기존과 동일한 필드 사용(`memberName`, `tags`, `weightedScore.toFixed(2)` / `averageScore.toFixed(2)`), 회의명만 `meetingSessionTitle(meetingTitle)`로 신규 표시(개요 탭), 참여회의수는 `meetingCount`로 신규 표시(전체의원랭킹 탭).

## Error Handling

- 별도 에러 케이스 없음 — 기존과 동일하게 `rows`가 비어있으면 `FlatList`가 빈 목록을 보여준다. `fetchFailed`/빈 목록 처리는 index.tsx의 기존 공통 분기를 그대로 사용하므로 탭별로 새로 만들 필요가 없다.

## Testing / Validation

- 수동 QA: `npx expo start`로 표1 화면을 열어
  - **개요 탭**: 전체의원+전체회의에서 여러 회의에 발언한 의원이 회의 수만큼 행으로 나오는지, 회의 열 값이 올바른지. 특정 의원 선택 시 그 의원의 발언 회의 수만큼 행이 남는지. 특정 회의 선택 시 의원당 1행만 나오는지(회의 열 값 전부 동일). 4개 헤더(의원명/회의/태그/평가점수) 정렬 토글 확인.
  - **전체의원랭킹 탭**: 클릭 시 상단 필터가 전체의원/전체회의로 리셋되는지, 의원당 1행만 나오는지, 참여회의수가 개요 탭에서 센 회의 수와 일치하는지, 평가점수(평균)가 그 의원의 개요 탭 행들의 평가점수 평균과 일치하는지. 4개 헤더 정렬 토글 확인. 탭 활성 중 상단 필터를 다시 조작했을 때 결과가 좁혀지는지(잠금 없음 확인).
  - **제목 전환**: 개요/세부항목(회의 미선택) → "회의별 랭킹", 회의 선택 → "표1. {회의명}", 전체의원랭킹 → "전체의원 랭킹"로 바뀌는지 확인.
- 별도 유닛 테스트는 추가하지 않는다 — 순수 UI 컴포넌트이며 그룹화 로직(`groupByMemberMeeting`/`groupByMember`)은 기존에 이미 쓰이던(혹은 거의 그대로 재사용하는) 함수이기 때문.

## Key Decisions (User-Approved)

| 항목 | 결정 |
|---|---|
| 상단 제목(회의 미선택, 개요/세부항목) | "전체 발언 랭킹" → "회의별 랭킹" |
| 개요 탭 그룹화 단위 | 의원×회의 조합당 1행 (`groupByMemberMeeting`) |
| 개요 탭 회의 열 | 추가 — `meetingSessionTitle()` 사용, 의원명과 태그 사이, 정렬 가능 |
| 개요 탭 keyExtractor | `statementId`로 롤백 |
| 새 탭 위치 | 기존 탭바(개요/세부항목)에 3번째 탭 "전체의원랭킹"으로 추가 |
| 전체의원랭킹 탭 클릭 시 | 상단 필터를 전체의원/전체회의로 강제 리셋 |
| 전체의원랭킹 그룹화 단위 | 의원당 1행, 참여 회의 대표 발언 점수 산술평균 (`groupByMember`, 삭제하지 않고 유지) |
| 전체의원랭킹 컬럼 | 의원명 / 참여회의수 / 태그 / 평가점수(평균), 4개 모두 정렬 가능 |
| 전체의원랭킹 탭에서 필터 재조작 | 막지 않음(잠금 없음) — 좁혀진 결과를 그대로 평균해 보여줌 |
| 탭별 상단 제목 | 탭에 따라 다르게 표시("회의별 랭킹" / "표1. {회의명}" / "전체의원 랭킹") |
| 세부항목 탭 / 축 가중치 범위 기능 | 변경 없음 |
