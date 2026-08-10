# 표1 "개요" 탭 — 표 형태 전환 + 헤더 정렬 Design Spec

**Date:** 2026-08-10
**Status:** Approved

## Problem

표1(회의별 인사이트 화면)의 "개요" 탭(`mobile/src/components/table1/OverviewTab.tsx`)이 카드 리스트로만 표시되어, 여러 의원을 한눈에 비교하거나 특정 기준으로 정렬해서 보기 어렵다.

## Goal

- 개요 탭을 카드 리스트 대신 표 형태로 표시한다. 컬럼은 **의원명 / 태그 / 평가점수** 3개.
- 각 컬럼 헤더를 탭하면 해당 컬럼 기준으로 정렬되고, 같은 헤더를 다시 탭하면 오름차순/내림차순이 토글된다.

## Non-Goals

- 카드 뷰와 표 뷰를 전환하는 토글은 만들지 않는다 — 표로 완전히 대체한다.
- "이 회의 발언 N건" 배지, 상단 토픽 텍스트 등 3개 컬럼에 속하지 않는 기존 부가 정보는 유지하지 않는다.
- 세부항목 탭(`ScoreGridTab.tsx`, 표2)은 이미 표 형태이므로 변경 대상이 아니다. 단, 스타일(테두리·헤더 배경·토큰 사용)은 그대로 재사용한다.

## Architecture

`OverviewTab.tsx` 내부만 수정한다. 데이터 소스(`groupByMemberMeeting`, `InsightRow`)는 변경하지 않는다.

- **정렬 상태**: 컴포넌트 로컬 `useState<{ field: "member" | "tags" | "score"; direction: "asc" | "desc" }>`. 기본값 `{ field: "score", direction: "desc" }` (기존 카드 리스트의 기본 정렬과 동일).
- **정렬 로직**: `groupByMemberMeeting(rows)` 결과를 정렬 상태에 따라 정렬.
  - `member`: `memberName.localeCompare(...)`
  - `tags`: `tags.join(", ").localeCompare(...)`
  - `score`: `weightedScore` 숫자 비교
  - `direction === "asc"`이면 오름차순 비교 결과를 그대로, `desc`이면 반전.
- **헤더 탭 동작**: 같은 필드를 다시 탭하면 방향 토글, 다른 필드를 탭하면 해당 필드로 전환 — 평가점수는 `desc`, 의원명/태그는 `asc`로 초기화.
- **렌더링**: `FlatList` + `stickyHeaderIndices={[0]}`로 헤더 행을 고정하고 나머지 행만 스크롤.
  - 헤더 행: 3개 `Pressable` 셀(의원명/태그/평가점수). 활성 정렬 컬럼에는 방향 표시(▲/▼)를 라벨 옆에 텍스트로 붙인다.
  - 데이터 행: 기존처럼 `Pressable`로 감싸 탭 시 `/statement/[id]`로 이동(헤더는 이동 없음, 정렬만 동작).
  - 컬럼 폭: 의원명 고정, 평가점수 고정, 태그는 `flex: 1` + `numberOfLines={1}`로 말줄임.
- **스타일**: `ScoreGridTab.tsx`의 표 스타일(테두리, 헤더 배경색, `colors`/`typography`/`spacing`/`radius` 토큰)을 재사용해 표1/표2 간 시각적 일관성을 유지한다. 새 하드코딩 색상/사이즈를 추가하지 않는다(CLAUDE.md 모바일 UI 스타일 규칙).

## Data

- `tags`: `row.tags.join(", ")`로 쉼표 나열 텍스트 표시.
- `weightedScore`: `.toFixed(2)`, 기존과 동일하게 강조색(`colors.primary.normal`).

## Error Handling

- 별도 에러 케이스 없음 — 기존 `rows` prop이 비어있으면 `FlatList`가 빈 목록을 그대로 보여준다(기존 동작과 동일).

## Testing / Validation

- 수동 QA: `npx expo start`로 표1 화면을 열어 각 헤더 탭 시 정렬 방향이 올바르게 토글되는지, 행 탭 시 상세 화면 이동이 유지되는지 확인.
- 별도 유닛 테스트는 추가하지 않는다 — 순수 UI 컴포넌트이며 정렬 비교 로직이 단순해 기존 프로젝트 테스트 관례(파이프라인/스크래퍼 로직 위주)에서 벗어남.

## Key Decisions (User-Approved)

| 항목 | 결정 |
|---|---|
| 적용 범위 | 카드 뷰 완전 대체(토글 없음) |
| 태그 표시 | 쉼표로 나열한 텍스트 |
| 정렬 동작 | 헤더 클릭 시 오름차순/내림차순 토글 |
| 기본 정렬 | 평가점수 내림차순(기존과 동일) |
| 헤더 고정 | `stickyHeaderIndices`로 스크롤 중에도 헤더 고정 |
