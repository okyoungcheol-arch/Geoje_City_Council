# Design.md — 거제시의회 제10대 회의 AI 인사이트 앱

> 상세 설계는 [docs/superpowers/specs/2026-08-06-gjcl-10th-council-insights-design.md](docs/superpowers/specs/2026-08-06-gjcl-10th-council-insights-design.md), 태스크 단위 구현 계획은 [docs/superpowers/plans/2026-08-06-gjcl-10th-council-insights-plan.md](docs/superpowers/plans/2026-08-06-gjcl-10th-council-insights-plan.md)에 있습니다. 이 문서는 그 요약본입니다.

## 문제

거제시의회 홈페이지(gjcl.go.kr)는 회의록·영상을 회의 단위로만 제공한다. 의원별로 발언을 가로질러 비교하거나, 발언의 질(학습 수준·아이디어·실행 가능성 등)을 평가할 방법이 없다.

## 목표

제10대 회의(5분자유발언 제외)를 대상으로:

1. 의원별 발언(회의록 텍스트)을 **Sonnet 5**로 요약·태깅
2. **Opus 5**로 5개 축을 1~5점으로 채점: **학습수준 · 질의평점 · 아이디어점수 · 실행가능성 · 거제영향도**
3. 결과를 **모바일 앱**(iOS/Android, React Native + Expo)에서 표/카드 형태로 제공
4. 태그를 탭하면 해당 발언의 **회의록 원문**으로 이동 (v1에 있었던 "영상으로 이동" 기능은 폐기됨)

## 아키텍처

```
gjcl.go.kr
   │  (Playwright 스크래핑 — 회의 목록 + 회의록 텍스트만, 영상 없음)
   ▼
backend/  Next.js API, Vercel 배포
   │  Postgres (Neon) ── meetings / members / agenda_items / statements / statement_insights
   │  AI 파이프라인: Sonnet 5 (요약·태그) → Opus 5 (5축 채점)
   │  GET /api/insights (필터: member, meeting, minGeojeImpact)
   ▼
mobile/  React Native + Expo 앱
   목록 화면 (표/카드 + 태그 칩) → 태그 탭 → 발언 상세 화면 (회의록 원문 + 요약 + 5개 점수 + 채점 근거)
```

`backend/`와 `mobile/`은 완전히 분리된 두 프로젝트다. 모바일 앱은 DB에 직접 접근하지 않고 오직 `/api/insights`만 호출한다.

## 비주얼 디자인

모바일 앱의 색상·타이포그래피·spacing·radius는 처음부터 새로 만들지 않고 **Wanted Design System**(claude.ai에서 Figma 파일로부터 재구성된 디자인 시스템)의 토큰을 채택한다. 원본 값은 [docs/design-tokens/wanted-design-system.md](docs/design-tokens/wanted-design-system.md)에 기록되어 있고, 실제 코드는 `mobile/theme/tokens.ts`(Task 11)에서 만들어진다. Wanted는 채용 플랫폼이라 우리 도메인과 무관하지만, 검증된 토큰 체계를 그대로 재사용해 처음부터 일관된 UI를 갖추는 것이 목적이다.

## 출력 형식 (요청 원문 반영)

| 컬럼 | 설명 |
|---|---|
| 회의 제목 | `meetings.title` |
| 의원명 | `members.name` |
| 주요발언 태그 | `statement_insights.tags[]` — 탭하면 회의록 원문 화면으로 이동 |
| 학습수준 | 1~5, Opus 5 채점 |
| 질의평점 | 1~5, Opus 5 채점 |
| 아이디어점수 | 1~5, Opus 5 채점 |
| 실행가능성 | 1~5, Opus 5 채점 |
| 거제영향도 | 1~5, Opus 5 채점 (거제 발전·개선에 미치는 영향도) |

## v1 → v2 변경 이력

| 항목 | v1 (폐기) | v2 (현재) |
|---|---|---|
| 플랫폼 | Next.js 웹 대시보드 | React Native + Expo 모바일 앱 (+ Next.js API 백엔드) |
| 태그 클릭 동작 | 영상의 해당 시점으로 이동 (타임코드 or 영상 페이지) | 앱 내 회의록 원문 상세 화면으로 이동 |
| 수집 대상 | 회의록 텍스트 + 영상 URL/타임코드 | 회의록 텍스트만 |
| DB 컬럼 | `meetings.videoUrl`, `agenda_items.videoTimecodeSeconds` | 삭제됨 |

## 핵심 결정 사항

- 대상: 제10대, 5분자유발언 제외 전 카테고리 (본회의/시정질문/상임위 4종/예산결산특위/인사청문특위/행정사무감사)
- 모델 역할 고정: 요약·태그 = Sonnet 5 / 인사이트 채점 = Opus 5 (자세한 계약은 [agent.md](agent.md))
- 인증: Vercel AI Gateway, OIDC 기본 (수동 키 발급 불필요)
- 점수 척도: 1~5점
- 1차 범위는 과거 회의 일괄 배치 — 자동 크론/스케줄링 없음 (실행 방법은 [harness.md](harness.md))

## Non-Goals (1차 범위 제외)

- 영상 수집/재생/타임스탬프 (완전 폐기)
- 신규 회의 자동 감지/주기적 처리
- 5분자유발언 분석
- 다국어 지원
- 앱스토어/플레이스토어 정식 출시 (1차는 EAS 빌드 + 내부 테스트까지)
