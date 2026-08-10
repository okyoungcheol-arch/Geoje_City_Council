# 거제시의회 의정활동 평가 — 8축 가중평균 루브릭 반영 Design Spec

**Date:** 2026-08-07
**Status:** Draft (오픈 이슈 §2 해소 전까지 구현 착수 보류)
**Supersedes(평가 루브릭 한정):** `docs/superpowers/specs/2026-08-06-gjcl-10th-council-insights-design.md`의 5축 채점 방식(학습수준·질의평점·아이디어점수·실행가능성·거제영향도)
**루브릭 원문:** 리포지토리 루트 `CLAUDE.md` (v1.1)

---

## 0. 이 문서의 목적

루트 `CLAUDE.md`는 8축(창의성·실현가능성·근거법적·지속성·견제력·시민체감·미래전략·거제발전) 가중평균 평가 루브릭을 정의한다. 이 문서는 그 루브릭을 **실제 제품**(현재 `worktree-gjcl-council-insights` 브랜치에 구현된 `backend/`(Next.js API) + `mobile/`(Expo) 시스템)에 어떻게 반영할지의 설계 스펙이다.

**중요**: 이 문서는 설계만 다루며, 이번 작업 범위에는 `backend/lib/ai/score.ts` 등 실제 코드 변경이 **포함되지 않는다**. 구현은 `docs/superpowers/plans/2026-08-07-gjcl-member-evaluation-rubric-plan.md`의 Phase A~E로 별도 착수한다.

---

## 1. 현재 구현 시스템과의 관계

| 항목 | 현재 구현(worktree, 5축) | 신규 루브릭(루트 CLAUDE.md, 8축) |
|---|---|---|
| 평가축 | 학습수준·질의평점·아이디어점수·실행가능성·거제영향도 | 창의성·실현가능성·근거·법적·지속성·견제력·시민체감·미래전략·거제발전 |
| 채점 단위 | 발언(statement) 1건 | 발언 1건 (동일) + 세션 단위 가중평균 집계 |
| 집계 방식 | 없음 (5개 점수를 그대로 저장·표시) | §4 발언유형별 가중치를 적용한 **가중평균** 필수 |
| 모델 배정 | 요약/태그 = Sonnet 5, 5개 점수 채점 = Opus 5 | **동일 원칙 고정 계승**(CLAUDE.md 상단 "모델 배정 원칙") — 개발(발췌·요약·태그·표2용 요약 초안) = **Sonnet 5**, Insight(agent1~4 8축 채점) = **Opus 5**. 4-persona는 Opus 5 프롬프트 내부 구조로 구현하고 API 호출은 기존과 동일하게 statement당 1회 구조 유지 |
| 발언유형 구분 | 없음 | 5분 이상 발언 / 예산·결산 심의 / 행정사무감사 / 조례 발안 설명 — 가중치 적용에 필수 |
| UI 노출 | 5개 점수 개별 표시, 집계 없음 | 표1(세션 요약, 가중평균 포함) + 표2(의원 상세, 탭 시 표시) |

**대체 방향**: 신규 8축 가중평균 루브릭이 기존 5축 시스템을 **대체**한다(사용자 확정). 즉 `backend/lib/ai/score.ts`의 `ScoreSchema`, `db/schema.ts`의 `statementInsights` 컬럼, `mobile/`의 인사이트 표시 UI가 모두 8축 체계로 전환 대상이다.

---

## 2. 오픈 이슈 — 반드시 사용자 결정 후 구현 착수

### 2.1 5분자유발언 포함 여부 충돌 (미해결)

- 루트 `CLAUDE.md` §1.1·§4는 **"5분 이상 발언"을 발언유형 중 하나로 포함**하고 자체 가중치를 부여한다.
- 그러나 현재 프로젝트의 전역 제약(`.claude/worktrees/gjcl-council-insights/CLAUDE.md`, v1·v2 `design.md` 공통)은 **"5분자유발언 전면 제외 — `/kr/cast/free.do` 스크래핑·처리 금지"**다.
- 두 문서의 "5분 이상 발언"이 동일한 발언 유형(홈페이지의 `free.do` 5분자유발언)을 가리키는지, 아니면 상임위 발언 중 5분을 넘는 일반 발언(별개 카테고리)을 가리키는지 **이 스펙만으로는 확정할 수 없다.**
- **결정 필요**: (a) 5분자유발언을 이번에 스코프에 새로 포함할 것인가 (스크래퍼·전역 제약 변경 필요), 또는 (b) 루트 CLAUDE.md의 "5분 이상 발언"을 기존 상임위 발언 카테고리 중 하나(예: 상임위원회 자유토론)로 재정의할 것인가.
- 이 결정이 나기 전까지 Phase A(§Implementation Plan) 착수를 보류한다.

### 2.2 발언 단위 vs 세션 단위 집계

- 현재 DB는 `statements`(발언 1건) 단위로 저장되고 `statement_insights`도 발언 1건당 1행이다.
- 신규 루브릭의 표1은 **회의(세션) 단위**로 의원별 1행을 보여준다. 한 의원이 한 세션에서 여러 번 발언(질의→답변→재질의 등)한 경우, 표1의 1행으로 어떻게 합산할지(마지막 발언 채점만 사용? 발언들을 합산 재채점?) 결정이 필요하다. 잠정 권고안은 §4.2에 기술.

---

## 3. 데이터 모델 변경 (스케치, 구현 시 최종 확정)

`statement_insights` 확장안:

```
statement_insights
  ...(기존 필드 유지: id, statement_id, summary, tags, rationale, model, processed_at)
  - creativity            integer 1-5, nullable
  - feasibility            integer 1-5, nullable
  - evidence_legal         integer 1-5, nullable
  - persistence            integer 1-5, nullable   -- N/A면 null
  - persistence_status     enum('scored','pending_future_evaluation')
  - oversight              integer 1-5, nullable
  - citizen_benefit        integer 1-5, nullable
  - future_strategy        integer 1-5, nullable
  - city_development       integer 1-5, nullable
  - speech_type             enum('five_min','budget_review','admin_audit','ordinance_proposal')
  - weighted_score          numeric, nullable        -- §4 산출식 결과, speech_type별 가중치 적용
  - topics_to_watch         jsonb text[]              -- "향후 감시할 주제"
  - prior_session_references jsonb text[]             -- 지속성 축 근거로 인용된 이전 회기 발언 식별자
```

세션 단위 집계 뷰(신규): 의원×회의(meeting) 기준으로 `weighted_score`를 표1 형태로 조회하는 쿼리 레이어. 기존 `lib/queries/insights.ts`를 확장하거나 신규 `lib/queries/memberSummary.ts`로 분리.

---

## 4. UI 매핑 — 표1 / 표2

현재 실제 제품은 웹 대시보드가 아니라 **모바일(Expo) 앱**이다(v2 pivot). 따라서 루트 CLAUDE.md의 "클릭"은 실제로는 "탭"으로 구현되며, 기존에 이미 확립된 패턴("태그 탭 → 회의록 상세화면 이동", v2 `design.md` §Tag → 회의록 이동 메커니즘)과 동일 계열로 매핑한다.

### 4.1 표1 → 인사이트 탭 화면 (개요 탭 + 축별 점수 탭)

> 2026-08-08 브레인스토밍으로 아래 "탭 분리" 안(안 1)으로 확정 — 이전 버전(가로 스크롤 통합 표, 안 2)을 대체한다. 결정 근거: 이 화면의 최우선 목적은 "여러 의원 비교/스캔"이며, 텍스트 컬럼과 숫자 컬럼을 한 표에 두면 비교하려는 축을 보기 위해 매번 가로 스크롤을 해야 해 목적과 어긋난다고 판단.

- 화면: 회의(세션) 선택 후 의원별 평가를 **탭 2개**로 분리한다. CLAUDE.md §6.2의 12개 컬럼 전체(의원·주제·태그·향후 감시할 주제·8개 축·가중평균)는 유지하되, 텍스트 컬럼(비교 부담 큼)과 숫자 컬럼(비교 부담 적음)을 분리해 각 탭의 스크롤을 최소화한다.
  - **탭1 "개요"** (기본 화면, 가중평균 내림차순 정렬): `의원(탭 시 표2 이동) · 주제 · 태그(주요발언, 칩) · 가중평균` 4개 컬럼만 노출. 가로 스크롤 없이 한 화면에서 순위를 스캔한다.
  - **탭2 "축별 점수"**: `의원(좌측 고정, 탭 시 표2 이동) · 창의성 · 실현가능성 · 근거·법적 · 지속성 · 견제력 · 시민체감 · 미래전략 · 거제발전` 9개 컬럼. 값이 전부 1~5 숫자(또는 지속성의 N/A 배지)이므로 컬럼 폭을 좁게 잡아 스크롤을 최소화한다(기종에 따른 근소한 가로 스크롤은 허용).
  - `향후 감시할 주제`는 두 탭 어디에도 넣지 않는다 — 스캔용으로는 길이가 부담스러워 표2(§4.2 "연결된 향후 감시 주제")에서만 노출한다.
- 지속성 열이 `pending_future_evaluation`인 셀은 탭2의 좁은 컬럼 폭에 맞춰 축약 배지 "향후평가"로 표시한다(회색 톤, Task D.3과 동일 스타일 원칙). 전체 문구 "향후 발언평가내용"은 표2 상세 화면에서 노출한다.
- 가중치 각주(CLAUDE.md §6.2 각주 형식 — 창의성부터 거제발전까지 축별 가중치 나열)는 축 점수가 있는 **탭2 하단에만** 고정 노출한다. 탭1에는 축 컬럼이 없으므로 각주를 표시하지 않는다.
- 정렬/필터: 기존 v2 계획의 "의원별/회의별/거제영향도 최소값" 필터를 "의원별/회의별/발언유형별/가중평균 최소값"으로 대체하며, 필터는 두 탭에 공통 적용된다.

### 4.2 표2 → 의원 상세 화면 (표1의 의원명 탭 시 이동)

- 화면: 선택된 의원명 타이틀 + 발언 요약 + 주요 질의 + 답변 요지 + 연결된 향후 감시 주제.
- 데이터 소스: `member_detail_summary`(CLAUDE.md §6.1) — Sonnet 5 요약 단계에서 발언+답변 원문을 근거로 생성. 현재 파이프라인의 Stage 1(Sonnet 5 요약) 출력에 이 요약을 추가하는 것을 권장(Stage 2 Opus 5 채점 단계가 아니라 Stage 1에서 생성 — 요약 성격의 작업이므로 저비용 모델이 적합).
- 한 의원이 한 세션에서 여러 발언을 했다면, 표2는 해당 세션 내 모든 발언을 시간순으로 묶어 하나의 요약으로 보여준다 (§2.2의 잠정 권고: 세션 단위 표1 행 = 세션 내 발언들의 재채점이 아니라, 발언별 가중평균들을 발언 유형이 같다는 전제 하에 **재차 가중평균**하여 표1의 1행으로 합산. 발언 유형이 세션 내에서 섞이면 최다 발언 유형 기준으로 표기하고 표2에 개별 발언별 소계를 명시).

---

## 5. 마이그레이션 노트

`.claude/worktrees/gjcl-council-insights/agent.md`는 이미 다음을 경고하고 있다:

> "루브릭 문구를 수정하면 기존에 채점된 statement_insights 행과 점수 기준이 달라집니다" (프롬프트 버전 추적 없음, out of v1 scope로 명시)

8축 전환은 이 경고가 실제로 발동하는 케이스다. `docs/superpowers/plans/2026-08-07-gjcl-member-evaluation-rubric-plan.md`의 Phase E에서 다음을 다룬다:
- 기존 5축으로 채점된 행을 유지할지 폐기할지
- 재처리(reprocessing) 시 8축 프롬프트 버전을 `statement_insights.rubric_version` 같은 필드로 태깅할지

---

## 6. Non-Goals (이번 스펙 범위 제외)

- 실제 코드 변경 (`score.ts`, `db/schema.ts`, UI 컴포넌트) — Plan 문서화까지만
- §2.1 오픈 이슈의 해결 — 사용자 결정 대기
- 익명 채점 파이프라인 구현 (`CLAUDE.md` §5.2 권고, 로드맵 P0이지만 별도 스펙 필요)
