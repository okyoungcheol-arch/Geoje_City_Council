# agent.md — AI 에이전트 역할과 계약

이 시스템에는 사람 코딩 에이전트(Claude Code)와는 별개로, **런타임에 실제로 데이터를 처리하는 두 개의 LLM 에이전트**가 있습니다. 이 문서는 그 둘의 역할, 입출력 계약, 프롬프트/루브릭을 정의합니다. 구현은 `backend/lib/ai/summarize.ts`, `backend/lib/ai/score.ts`를 참고하세요.

## 왜 두 개로 나누는가

발언 하나당 "요약/태그 생성"과 "품질 채점"은 성격이 다른 작업입니다. 요약·태깅은 분량이 많고 정답이 비교적 명확한 추출 작업이라 저비용 모델로 충분하지만, 5개 축의 정성적 채점(학습수준·창의성·실행가능성 등)은 더 깊은 판단이 필요합니다. 그래서 **저비용 대량 추출은 Sonnet 5, 고품질 판단은 Opus 5**로 역할을 고정합니다. 이 배정은 바꾸지 않습니다.

## Agent 1 — Extraction Agent (Sonnet 5)

- **모델:** `anthropic/claude-sonnet-5` (Vercel AI Gateway 경유)
- **함수:** `summarizeStatement(rawText: string): Promise<{ summary: string; tags: string[] }>`
- **입력:** 의원 발언 원문 (회의록에서 추출한 텍스트, 화자 단위)
- **출력 스키마:**
  ```typescript
  { summary: string; tags: string[] } // tags: 2~4개, 자유 형식 한국어 태그
  ```
- **역할:** 발언의 핵심 내용을 2~3문장으로 요약하고, 발언 주제를 나타내는 짧은 태그를 생성한다. 태그는 사전 정의된 카테고리가 아니라 발언 내용에서 자유롭게 추출한다 (예: "재해예방", "예산증액", "관광인프라").
- **하지 않는 일:** 점수를 매기지 않는다. 사실 검증을 하지 않는다 (발언 내용을 그대로 요약할 뿐, 진위를 판단하지 않는다).

## Agent 2 — Insight Scoring Agent (Opus 5)

- **모델:** `anthropic/claude-opus-5` (Vercel AI Gateway 경유)
- **함수:** `scoreStatement(rawText: string, summary: string): Promise<InsightScores>`
- **입력:** 발언 원문 + Agent 1이 만든 요약 (원문만으로도 채점 가능하지만 요약을 함께 주면 채점 근거를 더 일관되게 만든다)
- **출력 스키마:**
  ```typescript
  interface InsightScores {
    learningLevel: number;      // 1-5, 학습수준
    questionScore: number;      // 1-5, 질의평점
    ideaScore: number;          // 1-5, 아이디어점수
    feasibilityScore: number;   // 1-5, 실행가능성
    geojeImpactScore: number;   // 1-5, 거제영향도
    rationale: string;          // 2-3문장, 채점 근거
  }
  ```
- **루브릭 (프롬프트에 명시된 채점 기준):**
  | 항목 | 기준 |
  |---|---|
  | 학습수준 | 발언에 담긴 사전 학습, 데이터·근거자료 활용 수준 |
  | 질의평점 | 질의의 날카로움, 구체성, 논리성 |
  | 아이디어점수 | 제안한 아이디어의 창의성과 참신함 |
  | 실행가능성 | 제안이 예산·제도상 현실적으로 실행 가능한 정도 |
  | 거제영향도 | 이 발언이 실현될 경우 거제시 발전과 개선에 미치는 영향의 크기 |
- **하지 않는 일:** 태그를 생성하지 않는다 (Agent 1의 책임). 정당·개인에 대한 가치 판단 없이 발언 내용 자체의 질만 평가한다.

## 파이프라인 순서

```
statements.rawText
   → Agent 1 (Sonnet 5) → { summary, tags }
   → Agent 2 (Opus 5, rawText + summary 입력) → InsightScores
   → statement_insights 테이블에 저장
```

순서를 바꾸지 않습니다 (Agent 2는 항상 Agent 1의 출력을 입력으로 받습니다). 두 호출 모두 실패 시 지수 백오프로 최대 3회 재시도하며, 실패한 발언은 로그에 남기고 배치 전체를 중단하지 않습니다 (`backend/scripts/pipeline/run.ts`).

## 재현성 관련 주의

- 루브릭 문구를 수정하면 기존에 채점된 `statement_insights` 행과 점수 기준이 달라집니다. 루브릭을 바꿀 때는 영향받는 행을 지우고 재실행하거나, `sonnetModel`/`opusModel` 컬럼과 별도로 프롬프트 버전을 추적하는 것을 고려하세요 (현재는 버전 추적 없음 — 1차 범위 밖).
- 두 에이전트 모두 `generateObject` + zod 스키마로 구조화 출력을 강제합니다. 스키마를 벗어난 응답은 SDK가 에러를 던지므로, 파이프라인의 재시도 로직이 이를 처리합니다.
