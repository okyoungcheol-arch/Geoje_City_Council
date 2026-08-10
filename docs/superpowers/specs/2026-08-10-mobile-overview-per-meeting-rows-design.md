# 표1 "개요" 탭 — 의원×회의 조합별 행 복원 + 회의 열 추가 Design Spec

**Date:** 2026-08-10
**Status:** Approved

## Problem

바로 이전 커밋(`cd4de7a`, `feat(mobile): collapse overview rows per member, show axis weight ranges in header`)에서 개요 탭(`OverviewTab.tsx`)을 의원당 1행으로 합치도록 바꿨다(`groupByMember`로 회의별 대표 발언 점수를 산술평균).

그런데 실제로 필요한 동작은 반대다: 전체의원+전체회의를 볼 때도, 특정 의원 하나를 선택했을 때도, 그 의원이 발언한 회의 수만큼 행이 나와야 한다(회의별·의원별 조회). 즉 세부항목 탭(`ScoreGridTab.tsx`)이 이미 하고 있는 것과 동일한 그룹화(`groupByMemberMeeting`, 의원×회의 조합당 1행)로 되돌려야 한다.

## Goal

- 개요 탭을 `groupByMember`(의원당 1행, 평균 점수) 대신 `groupByMemberMeeting`(의원×회의 조합당 1행, 그 조합의 대표 발언 점수)으로 되돌린다.
- 같은 의원이 여러 행에 걸쳐 나타날 수 있으므로, 각 행이 어느 회의인지 구분할 수 있도록 **회의** 열을 추가한다(의원명과 태그 사이).
- 회의 열도 다른 열(의원명/태그/평가점수)과 동일하게 헤더 탭으로 정렬 가능하게 만든다.

## Non-Goals

- 세부항목 탭(`ScoreGridTab.tsx`)은 이미 `groupByMemberMeeting` + 회의 열을 쓰고 있으므로 변경하지 않는다.
- `cd4de7a`에서 세부항목 탭 헤더에 추가된 "축 가중치 범위 표시" 기능은 이번 변경과 무관하므로 그대로 유지한다.
- `api.ts`의 `groupByMember`/`InsightMemberGroup`은 이 변경으로 완전히 미사용이 되므로 삭제한다(다른 곳에서 참조 없음, 확인 완료).

## Architecture

`mobile/src/lib/api.ts`와 `mobile/src/components/table1/OverviewTab.tsx`만 수정한다.

### api.ts

- `groupByMember` 함수와 `InsightMemberGroup` 인터페이스를 삭제한다.
- `groupByMemberMeeting`(의원×회의 조합당 대표 발언 1건 + 나머지 발언은 `siblings`)은 그대로 유지 — 이미 원하는 그룹화 단위를 제공한다.

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

## Data

- 표시 문자열은 기존과 동일한 필드 사용(`memberName`, `tags`, `weightedScore.toFixed(2)`), 회의명만 `meetingSessionTitle(meetingTitle)`로 신규 표시.

## Error Handling

- 별도 에러 케이스 없음 — 기존과 동일하게 `rows`가 비어있으면 `FlatList`가 빈 목록을 보여준다.

## Testing / Validation

- 수동 QA: `npx expo start`로 표1을 열어
  - 전체의원+전체회의: 여러 회의에서 발언한 의원이 회의 수만큼 행으로 나오는지, 회의 열 값이 올바른지 확인.
  - 특정 의원 선택: 그 의원의 발언 회의 수만큼 행이 남는지 확인.
  - 특정 회의 선택: 회의가 하나로 고정되므로 행이 의원당 1개씩만 나오는지(회의 열 값은 전부 동일) 확인.
  - 4개 헤더(의원명/회의/태그/평가점수) 모두 탭 시 정렬 방향 토글 확인.
- 별도 유닛 테스트는 추가하지 않는다 — 순수 UI 컴포넌트이며 그룹화 로직(`groupByMemberMeeting`)은 기존에 이미 쓰이던 함수를 재사용하기 때문.

## Key Decisions (User-Approved)

| 항목 | 결정 |
|---|---|
| 그룹화 단위 | 의원×회의 조합당 1행 (`groupByMember` 롤백) |
| 회의 열 | 추가 — `meetingSessionTitle()` 사용, 의원명과 태그 사이 |
| 회의 열 정렬 | 다른 열과 동일하게 헤더 탭으로 정렬 가능 |
| keyExtractor | `statementId`로 롤백 |
| 세부항목 탭 / 축 가중치 범위 기능 | 변경 없음 |
