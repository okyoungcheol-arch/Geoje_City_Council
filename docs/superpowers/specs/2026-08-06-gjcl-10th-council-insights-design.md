# 거제시의회 제10대 회의 AI 인사이트 대시보드 — Design Spec

**Date:** 2026-08-06
**Status:** Approved

## Problem

거제시의회 홈페이지(gjcl.go.kr)의 영상회의록 코너는 대수·회의 종류별로 회의 목록·회의록·영상을 제공하지만, 의원별 발언을 가로질러 비교하거나 발언의 질을 평가할 방법이 없다. 시민이 제10대 의정활동을 한눈에 파악하고 의원별 발언의 질을 비교할 수 있는 도구가 필요하다.

## Goal

제10대 회의(5분자유발언 제외) 전체를 대상으로:
1. 의원별 발언을 Sonnet 5로 요약·태깅하고,
2. Opus 5로 5가지 축(학습수준·질의평점·아이디어점수·실행가능성·거제영향도)의 AI 인사이트 평점을 매기고,
3. 회의 제목·의원명·태그·5개 점수를 표로 보여주는 웹 대시보드를 제공하며,
4. 태그를 클릭하면 해당 발언의 영상 지점(가능하면 정확한 타임코드, 아니면 회의 영상 페이지)으로 이동한다.

## Scope

**포함:** 제10대, 본회의·시정질문·상임위원회 4종·예산결산특별위원회·인사청문특별위원회·행정사무감사
**제외:** 5분자유발언 (`/kr/cast/free.do`)
**제외(1차 범위):** 자동 스케줄링/주기적 업데이트 — 과거 회의 일괄 배치만 수행하며, 재실행 가능하게 만들어 향후 확장에 대비

## Architecture

```
[Playwright 스크래퍼] → [Postgres] → [AI 파이프라인: Sonnet5 → Opus5] → [Next.js 대시보드 on Vercel]
```

- **수집기(Scraper):** Playwright(TypeScript)로 회의 목록·회의록 텍스트·영상 정보를 수집. JS 동적 렌더링 사이트이므로 헤드리스 브라우저로 폼 제출 후 렌더링 결과를 파싱.
- **저장소:** Postgres (Vercel Marketplace/Neon), Drizzle ORM. 대시보드의 필터/정렬 요구 때문에 파일 기반이 아닌 관계형 DB 사용.
- **AI 파이프라인 (모델 이원화, 고정 규칙):**
  - Stage 1 — **Sonnet 5** (`anthropic/claude-sonnet-5`): 발언 원문 → 요약 + 자유 형식 태그(2~4개). 대량·저비용 처리.
  - Stage 2 — **Opus 5** (`anthropic/claude-opus-5`): 발언 원문 + Stage1 요약 → 5개 항목 각 1~5점 채점 + 근거. 고품질 판단이 필요한 부분만 Opus 사용.
  - 두 모델 모두 **Vercel AI Gateway**를 통해 호출 (직접 Anthropic API 키 불필요). 인증은 기본적으로 **OIDC**: `vercel link` + `vercel env pull`만으로 `VERCEL_OIDC_TOKEN`이 자동 발급되어 별도의 게이트웨이 키를 수동으로 만들 필요가 없음(Vercel 인프라 밖에서 돌릴 때만 `AI_GATEWAY_API_KEY` 수동 발급으로 대체).
- **대시보드:** Next.js App Router, Vercel 배포. 표 형태 UI + 필터(의원별/회의별/점수범위) + 태그 클릭 시 영상 이동.

## Data Model

- `meetings`: 회의 제목, 대수, 회차/차수, 종류, 날짜, 원본 URL, 영상 URL
- `members`: 의원명, 대수
- `agenda_items`: 회의 FK, 안건명, 안건 순서, 영상 타임코드(초, nullable)
- `statements`: 발언 원문, meeting/member/agenda FK, 회의 내 순서
- `statement_insights`: statement FK, 요약, 태그[], 5개 점수(1~5), 채점 근거, 사용 모델명, 처리시각

## Video Jump Mechanism

사전 조사(WebFetch) 결과 사이트는 JS 동적 폼 기반이며, 안건별 타임코드 노출 여부는 정적 분석으로 확인 불가. 구현 1단계(Phase 1 스파이크)에서 실제 브라우저 자동화로 확인 후:
- 타임코드 확보 가능 → 태그 클릭 시 정확한 시점으로 이동 (`videoUrl#t={seconds}s`)
- 타임코드 확보 불가 → 태그 클릭 시 해당 회의의 영상 페이지로 이동 (best-effort, 승인된 폴백)

## Error Handling

- 스크래핑: 사이트 요청 간 1~2초 딜레이로 서버 부담 최소화, robots.txt 준수
- AI 파이프라인: 호출 실패 시 지수 백오프로 최대 3회 재시도, 실패 건은 로그로 남기고 배치 전체를 중단하지 않음
- 재실행 시 이미 처리된 항목은 건너뛰는 idempotent upsert 구조

## Testing / Validation

- 스크래핑: 실제 사이트 대비 표본 회의 수동 대조
- AI 파이프라인: 표본 발언에 대해 사람이 태그/점수를 검수해 rubric 튜닝
- 대시보드: 로컬 브라우저에서 표 렌더링·필터링·태그 클릭→영상 이동 수동 확인

## Key Decisions (User-Approved)

| 항목 | 결정 |
|---|---|
| 회의 범위 | 5분자유발언 제외 전체 |
| 데이터 수집 방식 | 헤드리스 브라우저 자동화 |
| 영상 이동 정확도 | 가능하면 정확 타임스탬프, 안되면 영상 페이지 이동 |
| 산출물 형태 | Next.js 웹 대시보드, Vercel 배포 |
| 점수 척도 | 1~5점 |
| 업데이트 주기 | 과거 회의 일괄 배치 (1차) |
| 모델 역할 분담 | 요약/태그 = Sonnet 5, 인사이트 채점 = Opus 5 |
| API 키 방식 | Vercel AI Gateway |

## Non-Goals (1차 범위 제외)

- 신규 회의 자동 감지/주기적 크론 처리
- 5분자유발언 분석
- 다국어 지원
