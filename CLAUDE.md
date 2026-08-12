# CLAUDE.md

이 저장소에서 작업하는 Claude(또는 다른 코딩 에이전트)를 위한 안내입니다.

## 프로젝트 한 줄 요약

거제시의회 제10대 회의(5분자유발언 제외) 회의록을 수집해 Sonnet 5로 구조화 신호(인용·제안요소·질의응답 왕복·자기제기 이슈)를 추출하고, 순수 코드로 5개 KPI(사전준비도·정책생산력·실시간 압박력·성과전환력·사후책임성)를 계산한 뒤, React Native(Expo) 모바일 앱으로 보여주는 시스템입니다. Opus 5는 회기간 이슈 매칭(KPI5)에만 쓰입니다. **영상 수집/재생/타임스탬프 이동 기능은 없습니다** — 태그를 탭하면 회의록 원문 화면으로 이동합니다.

## 문서 지도

- [docs/rubric/CLAUDE.md](docs/rubric/CLAUDE.md) — 5-KPI 의정활동 실적평가 루브릭 v2.1 (최상위 채점 기준·KPI 산식·에이전트 역할·출력 포맷). 채점 로직을 다룰 때는 이 문서를 먼저 읽는다.
- [Design.md](Design.md) — 제품 설계 개요 (무엇을, 왜)
- [agent.md](agent.md) — Sonnet 5 / Opus 5 두 AI 에이전트의 역할, 입출력 계약, 프롬프트/루브릭
- [harness.md](harness.md) — 스크래퍼 + AI 파이프라인 실행 방법, 환경변수, 재시도/멱등성 규칙
- [docs/design-tokens/wanted-design-system.md](docs/design-tokens/wanted-design-system.md) — 모바일 앱이 채택한 디자인 시스템의 원본 토큰 값 (색상/타이포/spacing/radius)
- [docs/superpowers/specs/](docs/superpowers/specs/) — 상세 설계 스펙 (superpowers brainstorming 산출물)
- [docs/superpowers/plans/](docs/superpowers/plans/) — 태스크 단위 구현 계획 (superpowers writing-plans 산출물)

## 모바일 UI 스타일 규칙

- 모든 색상·폰트 크기·spacing·radius는 `mobile/theme/tokens.ts`의 값(`colors`, `typography`, `spacing`, `radius`)을 통해서만 사용한다. 컴포넌트에 `#0066FF` 같은 하드코딩된 값을 직접 넣지 않는다.
- 새 색상/사이즈가 필요하면 먼저 `docs/design-tokens/wanted-design-system.md`에 해당 값이 있는지 확인하고, 없으면 사람과 상의 후 토큰을 추가한다 — 임의로 새 hex 값을 만들지 않는다.

## 저장소 구조

```
backend/   Next.js API 전용 앱 (Vercel 배포). 스크래퍼, DB 스키마, AI 파이프라인, /api/insights
mobile/    React Native + Expo 앱. backend의 API만 호출, DB에 직접 접근하지 않음
```

두 폴더는 독립된 npm 프로젝트입니다. `mobile/`이 `backend/`의 코드를 import하는 일은 없어야 합니다 — 오직 HTTP로만 통신합니다.

## 자주 쓰는 명령

```bash
# backend
cd backend && npm run dev                 # API 로컬 실행 (localhost:3000)
cd backend && npx tsx scripts/scrape/run.ts       # 전체 스크래핑 실행
cd backend && npx tsx scripts/pipeline/run.ts     # Sonnet5→Opus5 파이프라인 실행
cd backend && npx drizzle-kit studio      # DB 뷰어

# mobile
cd mobile && npx expo start               # 앱 로컬 실행 (Expo Go/시뮬레이터)
```

## 반드시 지켜야 할 규칙 (Global Constraints)

- 대상 범위는 **제10대**만. 5분자유발언(`/kr/cast/free.do`)은 절대 수집/처리하지 않는다.
- **영상 기능 전면 금지.** 영상 URL 수집, 타임코드, 플레이어 임베드, 딥링크 — 어떤 형태로도 추가하지 않는다. (v1에서 있었으나 v2에서 완전히 폐기됨)
- 모델 역할은 고정: 구조화 신호 추출(요약/태그/인용/제안요소/질의응답/자기제기 이슈) = `anthropic/claude-sonnet-5`, 회기간 이슈 매칭(KPI5) = `anthropic/claude-opus-5`. 5개 KPI 수치·등급 자체는 어떤 모델도 호출하지 않는 순수 코드(`backend/lib/scoring/kpi.ts`)로 계산한다. 이 역할들을 바꿔 쓰지 않는다.
- 모든 Anthropic 호출은 **Vercel AI Gateway**를 통해서만 (plain `"provider/model"` 문자열). 직접 `@ai-sdk/anthropic`이나 raw `ANTHROPIC_API_KEY` 사용 금지.
- 게이트웨이 인증은 기본적으로 **OIDC** (`vercel env pull`이 발급하는 `VERCEL_OIDC_TOKEN`). 수동 `AI_GATEWAY_API_KEY` 발급은 OIDC를 쓸 수 없을 때만.
- 평가지표는 회의록 텍스트만으로 계산 가능한 5개 KPI(사전준비도·정책생산력·실시간 압박력·성과전환력·사후책임성)이며, 종합 순위점수로 합산하지 않고 항상 독립적으로 표시한다 — `docs/rubric/CLAUDE.md` §3 참조. KPI3(실시간 압박력)·KPI4(성과전환력)는 해당 발언 직후 질의응답 구조가 없으면 `N/A`, KPI2(정책생산력)는 발언 내 제안이 0건이면 `N/A`, KPI5(사후책임성)는 3회기 미만 이력이면 "추적 중"으로 표기한다.
- DB는 Postgres (Vercel Marketplace/Neon), `@neondatabase/serverless` + `drizzle-orm/neon-http`, 환경변수 `DATABASE_URL`.
- 스크래핑은 요청 사이 1~2초 지연, robots.txt 준수. 병렬로 몰아서 요청하지 않는다.
- 파이프라인은 재실행해도 안전해야 한다 (이미 처리된 `statementId`는 건너뜀).
- 의원 이름은 `backend/lib/members/roster.ts`의 명단(`Data/2026_거제시의원_당선자_명단.xlsx` 기준 16명)으로 **표시 시점에만** 정규화한다 — 같은 의원이 회의마다 "부의장 당선의원 임수환" / "부의장 임수환" / "임수환"처럼 다르게 표기돼도 화면에는 하나로 통일해 보여준다. `members` 테이블 자체는 원문 그대로 유지하며 병합하지 않는다(§ DB 마이그레이션 아님).
- `getInsightRows()`는 정규화된 이름 기준으로 회의당 실질 발언 의원이 1명 미만(즉 0명)이면 그 회의 전체를 결과에서 제외한다 — 의사진행 발언·비의원 발언만 있어 평가할 내용이 전혀 없는 회의를 걸러내는 규칙이다(v2.1부터 3→1로 완화: 5분자유발언 참석자가 많고 안건 토의 참여자가 1명뿐인 회의도 목록에서 사라지지 않아야 하기 때문).

## 작업 방식

이 프로젝트는 superpowers 워크플로(brainstorming → writing-plans → subagent-driven-development)를 따라 계획되었습니다. 새 기능을 추가하거나 설계를 바꿀 때는 `docs/superpowers/specs/`에 새 설계 문서를 먼저 작성하고, 이 CLAUDE.md와 Design.md를 그에 맞춰 갱신하세요.
