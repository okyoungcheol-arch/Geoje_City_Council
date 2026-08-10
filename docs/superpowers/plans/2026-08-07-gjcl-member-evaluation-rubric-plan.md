# 거제시의회 의정활동 평가 — 8축 가중평균 루브릭 구현 계획 (미착수)

> **상태**: 계획만 존재, 실행 미착수. `docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md` §2의 오픈 이슈(5분자유발언 포함 여부)가 해소되기 전까지 Phase A를 시작하지 않는다.
>
> **Design spec:** `docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md`
> **루브릭 원문:** 리포지토리 루트 `CLAUDE.md` (v1.1)

**Goal:** 현재 `worktree-gjcl-council-insights` 브랜치에 구현된 5축 무가중 채점 시스템(`backend/lib/ai/score.ts` 등)을, 루트 `CLAUDE.md`가 정의한 8축(창의성·실현가능성·근거·법적·지속성·견제력·시민체감·미래전략·거제발전) 가중평균 루브릭으로 전환하고, 세션 단위 표1(가중평균 리스트) + 표2(의원 상세) UI를 제공한다.

---

## Phase A — 채점 파이프라인 (Opus 5) 교체

> **모델 배정(CLAUDE.md 고정 원칙 계승)**: 8축 채점(`score.ts`, Task A.1~A.3)은 **Opus 5**만 사용한다. 이전 회기 발언 컨텍스트 조회용 요약·발췌(Task A.1의 `priorContext.ts`, 표2용 `member_detail_summary` 생성)는 채점이 아닌 정형 추출 작업이므로 기존 Stage 1과 동일하게 **Sonnet 5**를 사용한다. 두 모델 역할은 맞바꾸지 않는다.

### Task A.1: `ScoreSchema` 8축 확장

**파일**: `backend/lib/ai/score.ts`

- 기존 5개 필드(`learningLevel`, `questionScore`, `ideaScore`, `feasibilityScore`, `geojeImpactScore`)를 CLAUDE.md §6.1 JSON 스키마의 8개 필드(`creativity`, `feasibility`, `evidence_legal`, `persistence`, `oversight`, `citizen_benefit`, `future_strategy`, `city_development`)에 대응하는 zod 스키마로 교체: `creativity`, `feasibility`, `evidenceLegal`, `persistence`(nullable), `oversight`, `citizenBenefit`, `futureStrategy`, `cityDevelopment` (TS/zod 관례상 camelCase 사용, API 응답 직렬화 시 CLAUDE.md §6.1과 동일한 snake_case JSON 키로 매핑).
- `persistence`는 `z.number().int().min(1).max(5).nullable()`, 별도 `persistenceStatus: z.enum(["scored", "pending_future_evaluation"])` 필드 추가.
- 프롬프트에 CLAUDE.md §3의 8축 앵커 기준(5~1점 서술)을 그대로 반영. 특히 §3④ 지속성의 "이전 회기 인용이 없으면 N/A" 규칙과 §5.1-4 금지사항을 프롬프트 지침으로 명시.
- 채점 대상 발언에 **이전 회기 발언 컨텍스트**를 함께 제공해야 지속성 축 채점이 가능 — 현재 파이프라인은 발언 단위로 독립 처리하므로, 동일 의원의 과거 `statement_insights.summary`를 조회해 프롬프트에 첨부하는 조회 단계 추가 필요 (신규 함수 `lib/ai/priorContext.ts` 제안).

### Task A.2: 가중평균 계산 유틸

**파일**: `backend/lib/scoring/weightedAverage.ts` (신규)

- CLAUDE.md §4 가중치표(8축×4발언유형)를 상수 테이블로 이식.
- `computeWeightedScore(scores, speechType)`: "―(제외)" 축과 `persistence === null`(N/A) 축을 분자·분모에서 제외하고 §4 산출식을 그대로 구현.
- 단위 테스트: CLAUDE.md §7.2 예시 7개 행(최민혁 4.20, 이화영 3.93, 석동찬 3.60, 황서영 3.47, 김미영 3.40, 장미란 3.27, 정예찬 2.80)을 픽스처로 사용해 계산 결과가 문서 값과 일치하는지 검증.

### Task A.3: 발언유형 분류

- 스크래핑 시점(또는 채점 전 전처리)에서 `speechType`을 4개 값(`five_min` / `budget_review` / `admin_audit` / `ordinance_proposal`) 중 하나로 분류하는 로직 필요. 회의 카테고리(`meetings.category`)로부터 매핑 가능한지 §2.1 오픈 이슈 해소 후 확정.

---

## Phase B — DB 마이그레이션

**파일**: `backend/db/schema.ts`, Drizzle migration

- `statement_insights`에 design spec §3의 컬럼 추가: `creativity`, `feasibility`, `evidenceLegal`, `persistence`(nullable int), `persistenceStatus`(enum), `oversight`, `citizenBenefit`, `futureStrategy`, `cityDevelopment`, `speechType`(enum), `weightedScore`(numeric), `topicsToWatch`(jsonb text[]), `priorSessionReferences`(jsonb text[]), `rubricVersion`(text, 기본값 `"v1.1"` — Phase E 마이그레이션 노트 참조).
- 기존 5개 컬럼(`learningLevel` 등)은 즉시 삭제하지 않고 유지 — Phase E에서 처리 방식 결정 후 별도 마이그레이션으로 제거.
- `member_detail_summary`(표2용 요약)를 저장할 위치 결정: `statement_insights`에 컬럼 추가 vs 세션×의원 집계 전용 신규 테이블(`session_member_summaries`). 발언이 여러 건인 세션에서는 후자가 정합성 관리가 쉬우므로 신규 테이블을 권장.

---

## Phase C — 백엔드 API

**파일**: `backend/app/api/insights/route.ts` (기존 확장) 또는 신규 `backend/app/api/session-summary/route.ts`

- 표1 데이터: 회의(`meetingId`) 단위로 의원별 `weightedScore`, `topicsToWatch`, 8축 원점수를 반환하는 엔드포인트.
- 표2 데이터: `memberId` + `meetingId`로 `member_detail_summary`(또는 `session_member_summaries`)를 조회하는 엔드포인트.
- 필터: 기존 `member`/`meeting`/`minGeojeImpact`를 `member`/`meeting`/`speechType`/`minWeightedScore`로 대체.

---

## Phase D — 모바일 UI

**파일**: `mobile/` 하위 인사이트 리스트 화면 + 상세 화면 컴포넌트 (design spec §4 참조)

- Task D.1: 표1 탭 화면 — 탭1 "개요"(의원·주제·태그·가중평균 4열, 가중평균 내림차순, 스크롤 없는 스캔용)와 탭2 "축별 점수"(의원 좌측 고정 + 8축 숫자 9열, 좁은 컬럼)로 분리 렌더링(design spec §4.1, 2026-08-08 확정). `향후 감시할 주제`는 두 탭에 넣지 않고 표2에서만 노출. 가중치 각주는 탭2 하단에만 고정 노출.
- Task D.2: 표2 상세 화면 — 표1의 의원명(탭1·탭2 공통) 탭 시 이동(기존 "태그 탭 → 상세화면" 네비게이션 패턴 재사용), 발언 요약·주요 질의·답변 요지·향후 감시 주제 표시.
- Task D.3: 지속성 축 렌더링 — 탭2에서는 좁은 컬럼 폭에 맞춰 축약 배지 "향후평가"로, 표2 상세에서는 전체 문구 "향후 발언평가내용"으로 표시(둘 다 회색 톤, 낮은 점수로 오인되지 않도록 별도 스타일 — `mobile/theme/tokens.ts` 토큰만 사용, 하드코딩 색상 금지).

---

## Phase E — 기존 데이터 마이그레이션 전략

- 현재 `statement_insights`에 실제로 채점 완료된 행이 0건(진행 상황: Vercel AI Gateway 결제 수단 문제로 Task 9 배치 실행이 blocked 상태, 2026-08-07 기준)이므로, **기존 5축 데이터 재처리 부담은 현재 없음** — 이번 전환은 "빈 테이블에 새 스키마 적용"에 가깝다. 단, 이후 5축으로 일부라도 채점이 진행된 경우를 대비해:
  - `rubricVersion` 컬럼으로 채점 당시 루브릭 버전을 태깅.
  - 8축 전환 시점 이후 재실행은 idempotent upsert 규칙(v1/v2 design.md 공통 원칙)을 유지하되, `rubricVersion`이 다른 기존 행은 스킵하지 않고 강제 재채점하도록 배치 스크립트 옵션 추가.

---

## 검증 (구현 착수 시)

- Task A.2 단위 테스트가 CLAUDE.md §7.2의 7개 예시 값과 일치.
- §2.1 오픈 이슈가 해소되어 `speechType` 매핑이 실제 스크래핑 카테고리와 1:1 대응되는지 확인.
- 모바일 앱에서 표1 → 표2 탭 네비게이션이 실제로 동작하는지 수동 QA (design spec §4.2).
