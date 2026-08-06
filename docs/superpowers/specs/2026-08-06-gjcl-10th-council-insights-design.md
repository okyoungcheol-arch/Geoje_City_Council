# 거제시의회 제10대 회의 AI 인사이트 앱 — Design Spec

**Date:** 2026-08-06
**Status:** Approved (v2 — mobile pivot)
**Supersedes:** v1 (Next.js 웹 대시보드 + 영상 타임스탬프 이동). 영상 관련 설계는 전부 폐기.

## Problem

거제시의회 홈페이지(gjcl.go.kr)의 영상회의록 코너는 대수·회의 종류별로 회의 목록·회의록·영상을 제공하지만, 의원별 발언을 가로질러 비교하거나 발언의 질을 평가할 방법이 없다. 시민이 제10대 의정활동을 모바일에서 한눈에 파악하고 의원별 발언의 질을 비교할 수 있는 도구가 필요하다.

## Goal

제10대 회의(5분자유발언 제외) 전체를 대상으로:
1. 의원별 발언(회의록 텍스트 기준)을 Sonnet 5로 요약·태깅하고,
2. Opus 5로 5가지 축(학습수준·질의평점·아이디어점수·실행가능성·거제영향도)의 AI 인사이트 평점을 매기고,
3. 회의 제목·의원명·태그·5개 점수를 모바일 앱(iOS/Android)에서 표/리스트로 보여주며,
4. 태그를 탭하면 해당 발언의 **회의록 원문**(텍스트)으로 이동한다 — **영상 연동은 범위에서 완전히 제외**.

## Scope

**포함:** 제10대, 본회의·시정질문·상임위원회 4종·예산결산특별위원회·인사청문특별위원회·행정사무감사
**제외:** 5분자유발언 (`/kr/cast/free.do`)
**제외:** 영상 수집·재생·타임스탬프 이동 기능 전체 (v1에서 폐기)
**제외(1차 범위):** 자동 스케줄링/주기적 업데이트 — 과거 회의 일괄 배치만 수행하며, 재실행 가능하게 만들어 향후 확장에 대비

## Architecture

```
[Playwright 스크래퍼] → [Postgres] → [AI 파이프라인: Sonnet5 → Opus5] → [backend/ Next.js API on Vercel] → [mobile/ Expo 앱]
```

두 개의 독립 폴더로 구성:

- **`backend/`** — Next.js(API 전용), Vercel 배포. 스크래퍼, AI 파이프라인, DB 스키마, `/api/insights` 등 REST 엔드포인트를 모두 포함. 모바일 앱은 DB에 직접 접근하지 않고 이 API만 호출한다.
- **`mobile/`** — React Native + Expo 앱. `backend/`의 API를 호출해 표/리스트 UI를 렌더링. EAS Build로 iOS/Android 빌드.

### 구성 요소

- **수집기(Scraper):** Playwright(TypeScript)로 회의 목록과 **회의록 텍스트만** 수집(영상 정보는 수집하지 않음). JS 동적 렌더링 사이트이므로 헤드리스 브라우저로 폼 제출 후 렌더링 결과를 파싱.
- **저장소:** Postgres (Vercel Marketplace/Neon), Drizzle ORM. 앱의 필터/정렬 요구 때문에 파일 기반이 아닌 관계형 DB 사용.
- **AI 파이프라인 (모델 이원화, 고정 규칙):**
  - Stage 1 — **Sonnet 5** (`anthropic/claude-sonnet-5`): 발언 원문 → 요약 + 자유 형식 태그(2~4개). 대량·저비용 처리.
  - Stage 2 — **Opus 5** (`anthropic/claude-opus-5`): 발언 원문 + Stage1 요약 → 5개 항목 각 1~5점 채점 + 근거. 고품질 판단이 필요한 부분만 Opus 사용.
  - 두 모델 모두 **Vercel AI Gateway**를 통해 호출 (직접 Anthropic API 키 불필요). 인증은 기본적으로 **OIDC**: `vercel link` + `vercel env pull`만으로 `VERCEL_OIDC_TOKEN`이 자동 발급되어 별도의 게이트웨이 키를 수동으로 만들 필요가 없음(Vercel 인프라 밖에서 돌릴 때만 `AI_GATEWAY_API_KEY` 수동 발급으로 대체).
- **API (`backend/app/api/insights/route.ts` 등):** DB를 조회해 JSON으로 반환. 의원/회의/점수 범위 필터를 쿼리 파라미터로 지원.
- **모바일 앱:** Expo Router 기반 화면 구성. 목록 화면(표/카드) + 발언 상세 화면(원문·태그·5개 점수·채점 근거).

## Data Model

- `meetings`: 회의 제목, 대수, 회차/차수, 종류, 날짜, 원본 URL — **`video_url` 컬럼 삭제 (v1 대비)**
- `members`: 의원명, 대수
- `agenda_items`: 회의 FK, 안건명, 안건 순서 — **`video_timecode_seconds` 컬럼 삭제 (v1 대비)**
- `statements`: 발언 원문, meeting/member/agenda FK, 회의 내 순서
- `statement_insights`: statement FK, 요약, 태그[], 5개 점수(1~5), 채점 근거, 사용 모델명, 처리시각

## Tag → 회의록 이동 메커니즘 (영상 대체)

v1의 "태그 클릭 → 영상 시점 이동"을 다음으로 대체한다:
- 목록 화면에서 태그(칩)를 탭하면 해당 발언의 상세 화면으로 이동
- 상세 화면은 발언 원문(`statements.rawText`) 전문, AI 요약, 5개 점수, 채점 근거를 함께 표시
- 영상 수집·플레이어·타임코드 관련 코드/컬럼/의존성은 전부 제거 — 스크래퍼는 회의록 텍스트만 수집하면 되므로 v1보다 수집 범위와 실패 지점이 줄어든다

## Error Handling

- 스크래핑: 사이트 요청 간 1~2초 딜레이로 서버 부담 최소화, robots.txt 준수
- AI 파이프라인: 호출 실패 시 지수 백오프로 최대 3회 재시도, 실패 건은 로그로 남기고 배치 전체를 중단하지 않음
- 재실행 시 이미 처리된 항목은 건너뛰는 idempotent upsert 구조
- API: DB 조회 실패 시 5xx + 에러 로그, 앱은 재시도/에러 상태를 화면에 표시

## Testing / Validation

- 스크래핑: 실제 사이트 대비 표본 회의 수동 대조
- AI 파이프라인: 표본 발언에 대해 사람이 태그/점수를 검수해 rubric 튜닝
- API: 로컬에서 `curl`/`fetch`로 필터 조합별 응답 확인
- 모바일 앱: Expo Go 또는 시뮬레이터에서 목록 렌더링·필터링·태그 탭→상세 이동 수동 확인

## Key Decisions (User-Approved)

| 항목 | 결정 |
|---|---|
| 회의 범위 | 5분자유발언 제외 전체 |
| 데이터 수집 방식 | 헤드리스 브라우저 자동화 (회의록 텍스트만) |
| 발언 이동 방식 | 태그 탭 → 앱 내 회의록 원문 상세 화면 (영상 완전 제외) |
| 산출물 형태 | React Native + Expo 모바일 앱 + Next.js API 백엔드(Vercel) |
| 점수 척도 | 1~5점 |
| 업데이트 주기 | 과거 회의 일괄 배치 (1차) |
| 모델 역할 분담 | 요약/태그 = Sonnet 5, 인사이트 채점 = Opus 5 |
| API 키 방식 | Vercel AI Gateway (OIDC 기본) |
| 아키텍처 | `backend/`(Next.js API) + `mobile/`(Expo) 2-폴더 구조 |

## Non-Goals (1차 범위 제외)

- 영상 수집/재생/타임스탬프 이동 (완전 폐기)
- 신규 회의 자동 감지/주기적 크론 처리
- 5분자유발언 분석
- 다국어 지원
- 앱스토어/플레이스토어 정식 출시 (1차는 EAS 빌드 + 내부 테스트까지)
