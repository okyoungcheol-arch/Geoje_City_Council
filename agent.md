# agent.md — AI 에이전트 역할과 계약

이 시스템에는 사람 코딩 에이전트(Claude Code)와는 별개로, **런타임에 실제로 데이터를 처리하는 두 개의 LLM 에이전트**가 있습니다. 이 문서는 그 둘의 역할, 입출력 계약, 프롬프트/루브릭을 정의합니다. 구현은 `backend/lib/ai/summarize.ts`, `backend/lib/ai/extractQaRounds.ts`, `backend/lib/ai/matchIssues.ts`, `backend/lib/scoring/kpi.ts`, 오케스트레이션은 `backend/lib/pipeline/processStatement.ts`를 참고하세요. 루브릭 원문은 `docs/rubric/CLAUDE.md`(v2.1)입니다.

## 왜 두 개로 나누는가

발언 하나당 "구조화 신호 추출"과 "회기간 이슈 매칭 판단"은 성격이 다른 작업입니다. 인용·제안요소·질의응답 왕복·자기제기 이슈 추출은 회의록에 명시된 내용을 그대로 뽑아내는 대량 추출 작업이라 저비용 모델로 충분하지만, "이번 회기 새 이슈가 의원의 기존 미해결 이슈와 같은 사안인가"는 표현이 달라도 의미가 같은지 판단하는 더 깊은 추론이 필요합니다. 그래서 **저비용 대량 추출은 Sonnet 5, 회기간 의미 매칭 판단은 Opus 5**로 역할을 고정합니다. 5개 KPI 수치·등급 자체는 어떤 모델도 호출하지 않는 순수 코드(`backend/lib/scoring/kpi.ts`)로 계산합니다. 이 배정은 바꾸지 않습니다.

## Agent 1 — Extraction Agent (Sonnet 5)

- **모델:** `anthropic/claude-sonnet-5` (Vercel AI Gateway 경유)
- **함수:** `summarizeStatement(rawText: string, agendaTitle?: string | null): Promise<SummaryResult>` (`backend/lib/ai/summarize.ts`)
- **입력:** 의원 발언 원문 (회의록에서 추출한 텍스트, 화자 단위) + 안건명(참고용, 있으면)
- **출력 스키마:**
  ```typescript
  interface SummaryResult {
    summary: string;                 // 2-3문장 요약
    tags: string[];                  // 2~4개, 자유 형식 한국어 태그
    isProcedural: boolean;            // 순수 의사진행 절차 발언 여부
    speechType: SpeechType;           // "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal"
    citations: Citation[];            // { type: "L"|"S"|"P"|"F"; text: string }[] — KPI1 사전준비도용
    proposals: Proposal[];            // { budget, timeline, subject, method: boolean }[] — KPI2 정책생산력용
    selfRaisedIssues: SelfRaisedIssue[]; // { description: string }[] — KPI5 사후책임성용
  }
  ```
- **역할:** 발언 요약·태깅에 더해, 회의록에 명시된 내용만 근거로 인용(법령조문/공식통계/검증가능출처/현장확인)·제안 4요소 충족 여부·향후 추적 가능한 자기제기 이슈를 추출한다. 인용·제안·이슈 후보가 없으면 빈 배열을 반환한다(추정으로 채우지 않는다).
- **하지 않는 일:** 점수를 매기지 않는다(KPI 계산은 순수 코드). 사실 검증을 하지 않는다.

## Agent 1b — Q&A Round Classifier (Sonnet 5)

- **모델:** `anthropic/claude-sonnet-5` (Vercel AI Gateway 경유)
- **함수:** `hasQaStructure(followingSpeakerNames: string[]): boolean`(순수 코드, LLM 미호출) + `extractQaRounds(questionText: string, answerTexts: string[]): Promise<QaRound[]>` (`backend/lib/ai/extractQaRounds.ts`)
- **입력:** `hasQaStructure`는 현재 발언 이후 다음 "의원" 턴이 나오기 전까지의 화자 이름 목록. 그중 비의원(집행부/사무국) 화자가 있으면 `extractQaRounds`를 호출해 의원 질의 원문 + 뒤따르는 집행부 답변 원문(들)을 넘긴다.
- **출력 스키마:**
  ```typescript
  interface QaRound {
    roundIndex: number;
    answerGrade: "확답" | "조건부" | "회피";
    bonusTags: string[]; // "모순포착" | "패턴제시" | "쟁점고정" | "법근거제시" — 표시 전용, KPI3 수치에는 합산되지 않음
  }
  ```
- **역할:** 왕복(round)마다 답변등급과 가산 태그를 분류한다 — KPI3(실시간 압박력)·KPI4(성과전환력)의 원재료. 질의응답 구조가 없으면(`hasQaStructure`가 false) 호출 자체를 생략하고 두 KPI는 N/A가 된다.

## Agent 2 — Cross-Session Issue Matcher (Opus 5)

- **모델:** `anthropic/claude-opus-5` (Vercel AI Gateway 경유, `providerOptions.gateway.order: ["anthropic","claudeaws","bedrock"]`)
- **함수:** `matchIssues(newIssues: string[], openTickets: OpenTicket[]): Promise<IssueMatchResult[]>` (`backend/lib/ai/matchIssues.ts`)
- **입력:** 이번 회기 새 이슈 후보(Agent 1의 `selfRaisedIssues`) + 이 의원의 기존 미해결(open) 이슈 티켓 목록. 대상 의원에게 미해결 티켓이 없으면 이 함수 자체를 호출하지 않는다(비용 절감).
- **출력 스키마:**
  ```typescript
  interface IssueMatchResult { newIssueIndex: number; matchedTicketId: number | null }
  ```
- **역할:** 새 이슈 후보가 표현은 다르더라도 기존 미해결 티켓과 같은 사안(같은 시설·같은 예산 항목·같은 정책)인지 판단한다. 매칭되면 해당 티켓을 "재검토됨"으로 기록(`issueReviews`)하고, 매칭되지 않으면 새 티켓(`issueTickets`)으로 등록한다. 확신이 낮으면 반드시 `null`(신규 취급) — 거짓 재검토가 거짓 신규보다 위험하다.
- **하지 않는 일:** 다른 의원의 이슈와는 절대 매칭하지 않는다(호출부가 의원별로 티켓 목록을 미리 분리해 넘긴다). KPI 수치를 계산하지 않는다(누적 비율은 쿼리 레이어가 계산).

## KPI 계산 — 순수 코드 (모델 미호출)

`backend/lib/scoring/kpi.ts`가 Agent 1/1b의 추출 결과로부터 KPI1~4를 계산하고, KPI5(사후책임성)는 `issueTickets`/`issueReviews` 누적치로 쿼리 레이어(`backend/lib/queries/insights.ts`)에서 계산한다. 산식·등급 경계값·N/A 조건은 `docs/rubric/CLAUDE.md` §3이 단일 진실 소스다.

## 파이프라인 순서 (`backend/lib/pipeline/processStatement.ts`)

```
statements.rawText
   → Agent 1 (Sonnet 5) → { summary, tags, isProcedural, speechType, citations, proposals, selfRaisedIssues }
   → (질의응답 구조 있으면) Agent 1b (Sonnet 5) → QaRound[]
   → 순수 코드 → KPI1~4 값/등급
   → (자기제기 이슈 있고 미해결 티켓 있으면) Agent 2 (Opus 5) → 이슈 매칭
   → statement_insights (+ issueTickets/issueReviews) 테이블에 저장
```

의사진행 발언(`isProcedural`)이나 비의원 발언은 Agent 1b/2를 호출하지 않고 `excludedReason`만 채운 뒤 즉시 저장한다. 모든 모델 호출은 실패 시 지수 백오프로 최대 3회 재시도하며, 실패한 발언은 로그에 남기고 배치 전체를 중단하지 않는다.

## 재현성 관련 주의

- 루브릭 문구를 수정하면 기존에 처리된 `statement_insights` 행과 채점 기준이 달라진다. `rubricVersion` 컬럼(현재 `"v2.0-5kpi"`, 수기 검증 데이터는 `"v2.0-5kpi-264-verified-sample"`)으로 버전을 구분하되, 루브릭을 바꿀 때는 영향받는 행을 지우고 재실행하는 것을 고려하라.
- 모든 모델 호출은 `generateObject` + zod 스키마로 구조화 출력을 강제한다. 스키마를 벗어난 응답은 SDK가 에러를 던지므로, 파이프라인의 재시도 로직이 이를 처리한다.
- KPI1(사전준비도)은 `processStatement.ts`가 `statements.rawText`로부터 계산한 어절수를 분모로 쓴다(v2.1부터 — 이전에는 스크래퍼가 수집하지 않는 발언시간(초)에 의존해 항상 N/A였다). 의례적 인사말을 완전히 제외하지 못하는 것은 알려진 근사다.
