# 모바일 앱 8축 실데이터 완전 통합 Design Spec

> **⚠️ 대체됨 (2026-08-11)**: 이 문서가 다루는 8축 모바일 통합은
> `docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md`(§5 UI 매핑)의 5-KPI 모바일 통합으로
> 완전히 대체되었다. 이 문서는 역사적 기록으로만 보존한다.

**Date:** 2026-08-08
**Status:** Approved

## Problem

백엔드는 이미 실 DB 데이터로 8축 채점 체계(창의성·실현가능성·근거법적·지속성·견제력·시민체감·미래전략·거제발전, `backend/lib/scoring/weightedAverage.ts`)로 전환되었고, `backend/app/table1/`에 표1(개요/축별 점수 탭)·표2(모달) 웹 화면까지 구현되어 있다. 반면 `mobile/`은 두 갈래로 갈라져 있다:

- **실 API를 호출하는 경로**(`src/lib/api.ts` → `index.tsx` → `InsightCard`/`InsightFilters`)는 여전히 구 5축 필드(`learningLevel`, `questionScore`, `ideaScore`, `feasibilityScore`, `geojeImpactScore`)로 타입이 잡혀 있어, 실제 백엔드가 내려주는 8축 JSON을 받아도 화면에는 `undefined`만 찍힌다.
- **8축 스키마로 만들어진 경로**(`src/lib/pilotSampleData.ts`, `components/table1/*`, `app/prototype/table1/*`)는 화면은 맞지만 하드코딩 목업이라 API를 전혀 호출하지 않는다.

두 경로를 하나로 합쳐, 모바일 앱이 실 DB 데이터를 8축 그대로 보여주도록 만든다.

## Goal

1. 모바일 홈 화면이 `/api/insights`가 실제로 반환하는 8축 필드를 정확한 타입으로 받아 렌더링한다.
2. 이미 만들어진 8축 UI(`OverviewTab`/`ScoreGridTab`, 개요·축별 점수 탭)를 실데이터로 구동해 표1을 재현한다.
3. 표1의 의원 행을 탭하면 표2 상세(요약·채점 근거·향후 감시 주제 + 8축 점수)로 이동한다.
4. 백엔드 웹 화면(`Table1Client.tsx`)과 동일한 표시 규칙(주제 대체값, 발언유형별 각주)을 재사용해 두 화면 간 표기가 어긋나지 않게 한다.
5. 목업/구현이 나뉘어 있던 흔적(프로토타입 라우트, 구 5축 카드)을 정리한다.

## Non-Goals

- 백엔드 API·DB 스키마·채점 파이프라인 변경 — 이미 완성되어 있고 이번 작업 범위 밖.
- 회의·발언유형을 넘나드는 새로운 집계/통계 화면 설계 — 기존 필터(의원/회의) 패턴을 8축에 맞게 고치는 선에서 그친다.
- 지속성(④) 축의 "향후 발언평가내용" 로직 자체 변경 — 이미 `persistenceStatus`로 백엔드가 내려주는 값을 그대로 표시만 한다.

## Architecture

```
mobile/src/lib/api.ts (InsightRow: 8축 타입, backend/lib/queries/insights.ts와 1:1 대응)
        │  fetchInsights({ member?, meeting?, minWeightedScore? })
        ▼
mobile/src/app/index.tsx (홈)
   ├─ 필터 바 (InsightFilters: 의원 pill / 회의 pill / 가중평균 하한 pill)
   ├─ 회의 미선택 시: 전체 랭킹 뷰 (표1 타이틀/각주 없음)
   └─ 회의 선택 시: "표1. {회의명}" + 발언유형별 각주
        ├─ 개요 탭 → components/table1/OverviewTab.tsx (실데이터 구동)
        └─ 축별 점수 탭 → components/table1/ScoreGridTab.tsx (실데이터 구동)
             │  각 행 탭
             ▼
mobile/src/app/statement/[id].tsx (표2 상세 — 8축 점수 + 요약/원문/근거/향후 감시 주제 추가)
```

## 1. 데이터 레이어 — `mobile/src/lib/api.ts`

`InsightRow`를 `backend/lib/queries/insights.ts`의 `InsightRow`와 필드명 1:1로 맞춘다:

```ts
export interface InsightRow {
  statementId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal";
  creativity: number | null;
  feasibility: number | null;
  evidenceLegal: number | null;
  persistence: number | null;
  persistenceStatus: "scored" | "pending_future_evaluation";
  oversight: number | null;
  citizenBenefit: number | null;
  futureStrategy: number | null;
  cityDevelopment: number | null;
  weightedScore: number;
  summary: string;
  rawText: string;
  rationale: string;
}

export interface InsightFilters {
  member?: string;
  meeting?: string;
  minWeightedScore?: number;
}
```

`fetchInsights()`는 쿼리 파라미터를 `minGeojeImpact` → `minWeightedScore`로 교체하는 것 외 동작 변경 없음 (`backend/app/api/insights/route.ts`가 실제로 읽는 파라미터명과 일치시킨다).

`fetchInsightById()`는 그대로 유지 (`statementId`로 찾는 로직은 필드명 변경과 무관).

## 2. 축/발언유형 표시 상수 — `mobile/src/lib/axes.ts` (신규)

`mobile`은 `backend`의 코드를 import할 수 없으므로(worktree `CLAUDE.md` 제약), `backend/lib/scoring/weightedAverage.ts` + `backend/app/table1/Table1Client.tsx`의 표시용 상수를 값 그대로 복제한 신규 파일을 만든다:

- `AXES` (8개 키 배열, 순서 고정: creativity → feasibility → evidenceLegal → persistence → oversight → citizenBenefit → futureStrategy → cityDevelopment)
- `AXIS_LABELS` (한글 라벨: 창의성/실현가능성/근거·법적/지속성/견제력/시민체감/미래전략/거제발전)
- `AXIS_WEIGHTS` (`Record<SpeechType, Record<Axis, number | null>>`, `weightedAverage.ts`의 4개 발언유형 표를 값 그대로 복사)
- `SPEECH_TYPE_LABELS` (5분 이상 발언/예산·결산 심의/행정사무감사/조례 발안 설명)

파일 상단에 "`backend/lib/scoring/weightedAverage.ts`, `backend/app/table1/Table1Client.tsx`와 값이 반드시 일치해야 하며, 백엔드 가중치표가 바뀌면 이 파일도 함께 갱신해야 한다"는 주석을 남긴다. 모바일은 가중평균을 **재계산하지 않는다** — `weightedScore`는 항상 서버가 계산해 내려준 값을 그대로 표시만 한다.

`weightFootnote(speechTypesUsed: SpeechType[]): string`도 `Table1Client.tsx`의 구현을 그대로 옮긴다 (발언유형별로 한 줄씩, `[유형명] 축라벨 값 · 축라벨 값 ...` 형식, `null` 가중치는 "―(제외)"로 표시).

## 3. 홈 화면 — `mobile/src/app/index.tsx`

- `InsightCard` 기반 `FlatList` 렌더링을 제거하고, `OverviewTab`/`ScoreGridTab` 탭 전환 UI(현재 `prototype/table1/index.tsx`에 있는 구조)를 홈으로 이전한다.
- 필터: 기존 pill UI(`InsightFilters`) 유지, `minGeojeImpact` prop/pill을 `minWeightedScore` (1~5 하한선)로 교체.
- **회의 미선택("전체 회의")**: `filtered` 배열 전체를 `weightedScore` 내림차순으로 보여주는 랭킹 뷰. 표1 타이틀/각주는 표시하지 않는다 (여러 회의·여러 발언유형이 섞여 있어 각주 하나로 대표할 수 없으므로).
- **회의 선택 시**: 헤더에 "표1. {회의명}" + `weightFootnote(해당 회의에 실제로 존재하는 speechType 집합)` 표시. 백엔드 `Table1Client.tsx`와 동일하게, 한 회의 안에 발언유형이 섞여 있으면 각주가 유형별로 여러 줄 나온다.
- "표1 프로토타입 (8축)" 링크 제거 (더 이상 별도 프로토타입이 아니라 홈 자체가 8축이므로).

## 4. `OverviewTab`/`ScoreGridTab` 실데이터 연동

- import 대상을 `@/lib/pilotSampleData`의 `Table1Row` → `@/lib/api`의 `InsightRow`로 교체.
- **키/링크 기준을 `row.member` → `row.statementId`로 변경.** 실데이터는 한 의원이 한 회의에서 여러 번(예: 5분발언 + 행정사무감사 질의) 발언할 수 있어 "회의당 의원 1행" 가정이 깨진다. `router.push(`/statement/${row.statementId}`)`로 이동.
- 주제 대체값(백엔드 `Table1Client.tsx:124`와 동일 규칙): `row.tags[0] ?? row.summary.slice(0, 24)`.
- `persistence`가 `null`이고 `persistenceStatus === "pending_future_evaluation"`이면 "향후평가" 배지 — 기존 로직 그대로, `Table1Row` → `InsightRow` 타입 교체만 하면 동작 동일.
- `ScoreGridTab`의 `footnote` prop은 홈 화면에서 `weightFootnote()` 결과를 전달.

## 5. 상세 화면 — `mobile/src/app/statement/[id].tsx`

기존 요약/원문/근거 3단 구성 위에 헤더를 추가한다:

- 회의명 / 의원명 (기존 유지)
- 가중평균 배지 (`weightedScore.toFixed(2)`)
- 8축 점수 그리드 (라벨은 `axes.ts`의 `AXIS_LABELS`, `persistence` N/A는 "향후평가")
- 향후 감시 주제 (`topicsToWatch: string[]` → 불릿 리스트, 빈 배열이면 "없음")

기존 "요약/회의록 원문/AI 채점 근거" 섹션은 그대로 유지 (필드명 변경 없음 — `summary`/`rawText`/`rationale`은 5축 시절에도 이미 있던 필드).

## 6. 정리 대상 (삭제)

- `mobile/src/app/prototype/table1/index.tsx`
- `mobile/src/app/prototype/table1/member/[name].tsx`
- `mobile/src/lib/pilotSampleData.ts`
- `mobile/src/components/InsightCard.tsx`
- `mobile/src/components/InsightFilters.tsx`의 `minGeojeImpact` 관련 부분 (컴포넌트 자체는 유지, prop만 교체)
- 홈 화면의 "표1 프로토타입 (8축)" 링크

## 열려 있었던 두 판단 지점 (해결됨)

이번 설계 승인 과정에서 제기됐던 두 지점은, 백엔드 `Table1Client.tsx`가 이미 실전에서 쓰고 있는 구현을 그대로 재사용하는 것으로 확정했다:

1. **"주제" 표시값** — 백엔드와 동일하게 `row.tags[0] ?? row.summary.slice(0, 24)`.
2. **발언유형 혼재 시 각주** — 백엔드와 동일하게 회의에 존재하는 발언유형마다 한 줄씩 각주를 이어붙인다 (`weightFootnote()`).

두 화면(백엔드 웹 관리자 화면, 모바일 앱)이 같은 규칙을 쓰므로 표기가 어긋나지 않는다.

## Testing / Verification

- `cd mobile && npx tsc --noEmit` — 타입 정리 후 컴파일 확인 (5축 필드 참조가 남아있으면 여기서 잡힘).
- `cd mobile && npx expo start` (web target) 로컬 구동 후: 홈 화면에서 회의 미선택/선택 각각의 랭킹 뷰·표1 뷰 확인, 의원 행 탭 → 표2 상세 진입 확인, 지속성 "향후평가" 배지 노출 확인.
- 실 API(`EXPO_PUBLIC_API_BASE_URL`이 가리키는 배포된 backend)를 대상으로 실행해, 실제 268건 채점 데이터가 화면에 뜨는지 확인 (하드코딩 목업이 완전히 제거됐는지의 최종 검증).

## Rollout

- 이 변경은 `mobile/` 코드에만 국한되며 백엔드 API 계약은 바꾸지 않는다 (읽기 전용 API 소비 방식만 정합화).
- 배포는 Expo 앱 자체이므로 이번 작업 범위에서 Vercel 재배포는 필요 없다. 단, `mobile/.env`의 `EXPO_PUBLIC_API_BASE_URL`이 최신 backend preview/production URL을 가리키는지는 확인한다.
