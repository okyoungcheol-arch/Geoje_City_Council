# CLAUDE.md

이 저장소에서 작업하는 Claude(또는 다른 코딩 에이전트)를 위한 안내입니다.

## 프로젝트 한 줄 요약

거제시의회 제10대 회의(5분자유발언 제외) 회의록을 수집해 Sonnet 5로 요약·태깅하고 Opus 5로 5개 축(학습수준·질의평점·아이디어점수·실행가능성·거제영향도)을 채점한 뒤, React Native(Expo) 모바일 앱으로 보여주는 시스템입니다. **영상 수집/재생/타임스탬프 이동 기능은 없습니다** — 태그를 탭하면 회의록 원문 화면으로 이동합니다.

## 문서 지도

- [Design.md](Design.md) — 제품 설계 개요 (무엇을, 왜)
- [agent.md](agent.md) — Sonnet 5 / Opus 5 두 AI 에이전트의 역할, 입출력 계약, 프롬프트/루브릭
- [harness.md](harness.md) — 스크래퍼 + AI 파이프라인 실행 방법, 환경변수, 재시도/멱등성 규칙
- [docs/superpowers/specs/](docs/superpowers/specs/) — 상세 설계 스펙 (superpowers brainstorming 산출물)
- [docs/superpowers/plans/](docs/superpowers/plans/) — 태스크 단위 구현 계획 (superpowers writing-plans 산출물)

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
- 모델 역할은 고정: 요약/태그 생성 = `anthropic/claude-sonnet-5`, 5개 인사이트 점수 = `anthropic/claude-opus-5`. 이 둘을 바꿔 쓰지 않는다.
- 모든 Anthropic 호출은 **Vercel AI Gateway**를 통해서만 (plain `"provider/model"` 문자열). 직접 `@ai-sdk/anthropic`이나 raw `ANTHROPIC_API_KEY` 사용 금지.
- 게이트웨이 인증은 기본적으로 **OIDC** (`vercel env pull`이 발급하는 `VERCEL_OIDC_TOKEN`). 수동 `AI_GATEWAY_API_KEY` 발급은 OIDC를 쓸 수 없을 때만.
- 평점 척도는 5개 항목 모두 정수 1~5.
- DB는 Postgres (Vercel Marketplace/Neon), `@neondatabase/serverless` + `drizzle-orm/neon-http`, 환경변수 `DATABASE_URL`.
- 스크래핑은 요청 사이 1~2초 지연, robots.txt 준수. 병렬로 몰아서 요청하지 않는다.
- 파이프라인은 재실행해도 안전해야 한다 (이미 처리된 `statementId`는 건너뜀).

## 작업 방식

이 프로젝트는 superpowers 워크플로(brainstorming → writing-plans → subagent-driven-development)를 따라 계획되었습니다. 새 기능을 추가하거나 설계를 바꿀 때는 `docs/superpowers/specs/`에 새 설계 문서를 먼저 작성하고, 이 CLAUDE.md와 Design.md를 그에 맞춰 갱신하세요.
