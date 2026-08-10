# 거제시의회 8축 루브릭 → 5-KPI 회의록 전용 지표 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/rubric/CLAUDE.md` v1.1의 8축 가중평균 루브릭(창의성·실현가능성·근거법적·지속성·견제력·시민체감·미래전략·거제발전, Opus5 주관 채점)을 회의록 텍스트만으로 재현 가능한 5-KPI 체계(근거밀도·대안구체성·추궁심도·답변확보율·이슈지속추적률)로 완전히 대체하고, backend 파이프라인·DB·API·mobile UI를 전부 이 체계에 맞춰 갱신한다.

**Architecture:** Sonnet5가 회의록 원문에서 구조화 신호(인용·제안요소·질의응답 왕복·답변등급·자기제기 이슈 후보)를 추출하고, 순수 코드(`backend/lib/scoring/kpi.ts`)가 그 신호로부터 5개 KPI 수치·등급을 계산한다. Opus5는 오직 "이번 회기 새 이슈가 이 의원의 기존 미해결 이슈와 같은 사안인가"를 판단하는 회기간 이슈매칭에만 쓰인다(미해결 티켓이 없으면 호출 자체를 생략). 질의응답 구조 유무는 정적 발언유형 규칙이 아니라 "해당 발언 직후 다음 의원 턴 전까지 집행부/사무국 턴이 실제로 존재하는가"로 동적 판정한다.

**Tech Stack:** Next.js API routes + Drizzle ORM + Neon Postgres (backend), Vercel AI Gateway `generateObject`(Sonnet5/Opus5) + zod, Vitest, Expo/React Native + expo-router(mobile).

## Global Constraints

- 대상 범위는 제10대만, 5분자유발언은 절대 수집/처리하지 않는다(변경 없음, 기존 스크래�퍼가 이미 강제).
- 영상 기능 전면 금지(변경 없음, 이번 작업과 무관).
- 모델 역할: Sonnet5 = 구조화 신호 추출(개발), Opus5 = 회기간 이슈 매칭 판단(insight)에만 한정. 이 둘을 맞바꾸지 않는다. 5개 KPI 수치 자체는 어떤 모델도 호출하지 않는 순수 코드로 계산한다.
- 모든 Anthropic 호출은 Vercel AI Gateway를 통해서만(plain `"provider/model"` 문자열), `providerOptions.gateway.order: ["anthropic","claudeaws","bedrock"]`로 라우팅(기존 `score.ts`의 Vertex 429 회피 설정을 그대로 계승).
- 종합 순위점수는 만들지 않는다 — 5개 KPI를 항상 독립적으로 표시한다.
- `mobile/`은 `backend/` 코드를 import하지 않는다(HTTP로만 통신) — 상수 테이블은 mobile 쪽에 별도로 값을 복제해 유지한다(기존 `axes.ts` 방식과 동일).
- `mobile/theme/tokens.ts`의 `colors`/`typography`/`spacing`/`radius`만 사용, 새 하드코딩 색상·사이즈 금지.
- 파이프라인은 재실행해도 안전해야 한다(`getPendingStatementIds`의 LEFT JOIN 안티조인 방식 유지).
- DB는 `@neondatabase/serverless` + `drizzle-orm/neon-http`, 환경변수 `DATABASE_URL`.
- 기존 8축으로 채점된 `statementInsights` 행은 5-KPI로 환산 불가능하므로 전량 재처리 대상이다(Task 10에서 실측 확인 후 진행).

---

## Task 1: 루브릭 v2.0 — `docs/rubric/CLAUDE.md` 개정

**Files:**
- Modify: `docs/rubric/CLAUDE.md` (전체 §2~§9 재작성, 헤더 버전 표기 포함)

**Interfaces:**
- Consumes: 없음(문서 작업).
- Produces: 이후 모든 코드 작업(Task 5~18)이 참조하는 KPI 명칭·산식·N/A 조건·등급 경계값의 단일 진실 소스. 특히 필드명은 Task 5~11에서 그대로 코드 식별자(camelCase)로 옮겨간다: `citations`(L/S/P/F), `proposals`(budget/timeline/subject/method), `qaRounds`(answerGrade: 확답/조건부/회피, bonusTags), `selfRaisedIssues`, `kpiEvidenceDensity`, `kpiEvidenceDensityGrade`, `kpiSolutionSpecificity`, `kpiInterrogationDepth`, `kpiReQuestionRate`, `kpiCommitmentRate`.

- [ ] **Step 1: 헤더·버전 갱신**

`docs/rubric/CLAUDE.md`의 최상단(1~14행)을 다음으로 교체:

```markdown
# CLAUDE.md — 거제시의회 의정활동 실적평가 AI 시스템

> **목적**: 상임위 발언(임기 통합, 다회기)을 입력받아, 회의록 텍스트만으로 재현 가능한
> **5개 KPI**(근거밀도·대안구체성·추궁심도·답변확보율·이슈지속추적률)로 평가한다.
> **대상**: 거제시의회 (확장 시 타 지자체 적용 가능)
> **버전**: v2.0 · 2026-08-11 개정 (v1.1 2026-08-07 대비: 8축 가중평균 주관채점 체계를 폐기하고,
> 회의록 텍스트 단독으로 계산 가능한 5-KPI 체계로 전면 교체. 종합 순위점수 없이 5개 KPI를 항상 독립 표시.)
>
> **상위 문서 관계**: 이 문서는 본 리포지토리의 최상위 평가 루브릭이다.
> `docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md`가 이 루브릭을 실제 제품
> (채점 파이프라인 + UI)에 반영하는 설계 스펙이다. v1.1의 8축 체계
> (`docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md`)는 대체되었다.
>
> **모델 배정 원칙 (고정, 절대 교체 금지)**:
> - **개발(Development)** — 회의록 발췌·정제, 발언 단위 분리, 요약·태그 추출, 인용/제안요소/
>   질의응답 왕복·답변등급/자기제기 이슈 후보 등 **구조화 신호 추출**은 전부 **Claude Sonnet 5**
>   (`anthropic/claude-sonnet-5`)로 수행한다.
> - **Insight(§4 이슈 매칭)** — 이번 회기 새 이슈가 의원의 기존 미해결 이슈와 동일 사안인지
>   판단하는 **회기간 의미 매칭에만** **Claude Opus 5**(`anthropic/claude-opus-5`)를 사용한다.
>   그 외 5개 KPI 수치·등급은 어떤 모델도 호출하지 않는 순수 코드 공식으로 산출한다.
> - 두 모델 모두 Vercel AI Gateway를 통해서만 호출한다. 두 역할은 절대 맞바꾸지 않는다.
```

- [ ] **Step 2: §0 절차 문단 갱신**

기존 §0(17~30행)의 절차 목록을 5-KPI 흐름으로 교체:

```markdown
## 0. 이 문서를 읽는 Claude에게

이 파일은 평가 **작업 지침서**다. 회의록이 주어지면 아래 절차를 순서대로 실행한다.

1. `§1 데이터 검증` — 평가 가능 여부와 한계를 먼저 선언
2. `§2 신호 추출 역할`에 따라 회의록에서 구조화 신호를 추출
3. `§3 KPI 정의`의 산식대로 5개 KPI를 계산 — **모두 순수 코드, LLM 채점 없음**
4. `§4 이슈 지속 추적`(KPI5)만 Opus5로 회기간 의미 매칭 수행
5. `§5 금지사항` 및 N/A 규칙 점검 후 출력
6. `§6 출력 포맷`(표1 + 표2)으로 결과 제출

**절대 원칙**: 근거 없는 추정으로 신호를 만들지 않는다. 회의록에 없는 인용·제안·답변을 추출하지 않는다.
**절대 원칙 2**: 5개 KPI를 하나의 종합 순위점수로 합산하지 않는다. 항상 독립적으로 표시한다.
```

- [ ] **Step 3: §1 데이터 검증 표에 "질의응답 구조" 행 추가**

`docs/rubric/CLAUDE.md`의 §1.1 표(원본 37~49행)에 아래 행을 "발언 유형" 행 다음에 추가:

```markdown
| 질의응답 구조 | 해당 발언 직후, 다음 의원 턴이 나오기 전까지 집행부/사무국 턴이 실제로 존재하는가 | 없으면 KPI3(추궁심도)·KPI4(답변확보율)는 N/A. 발언유형이 아니라 이 구조 유무로 동적 판정 |
```

- [ ] **Step 4: §2 에이전트 역할 재정의**

원본 §2(58~93행, agent1~4)를 전부 삭제하고 다음으로 교체:

```markdown
## 2. 신호 추출 역할 정의

발언 원문(및 질의응답 구조가 있으면 뒤따르는 집행부 답변 원문)에서 아래 신호를 추출한다.
모두 **Sonnet 5**가 수행하는 구조화 추출 작업이며, 회의록에 명시적으로 나타난 내용만 추출한다.

### 인용 신호 (KPI1 근거밀도용)
발언 중 아래 4종 인용을 찾아 유형과 원문 발췌를 기록한다.

| 유형 | 인식 기준 |
|---|---|
| **L 법령조문** | 법률명 + 조·항 특정 ("관련 법에 따르면"은 불인정) |
| **S 공식통계** | 수치 + 기준연도/출처 명시 ("많은 주민들이"는 불인정) |
| **P 검증가능출처** | 지자체명 + 사업명 특정 ("타 지역에서는"은 불인정) |
| **F 현장확인** | 방문·사진·직접 관찰 언급 ("다시 방문 시행하면"은 불인정) |

### 제안요소 신호 (KPI2 대안구체성용)
발언에 담긴 제안 각각에 대해 4요소(예산 규모·조달방안, 시기·착수시점, 담당 주체, 실행 방법)의
충족 여부를 기록한다. 제안이 0건이면 KPI2는 N/A.

### 질의응답 왕복 신호 (KPI3·4용)
§1.1 "질의응답 구조"가 있는 발언만 대상. 의원 질의 원문과 뒤따르는 집행부 답변 원문을 왕복
단위(round)로 묶어, 각 round마다:
- **답변등급**: 확답(시기/주체/방법 중 2개 이상 명시) / 조건부(조건부 약속) /
  회피("검토하겠습니다"·"노력하겠습니다"·"살펴보겠습니다" 류, 구체성 없음)
- **가산 태그**: 모순포착(답변이 이전 진술과 모순됨을 지적) / 패턴제시(단발이 아닌 반복 구조로 제시) /
  회피차단(회피성 답변에 재질의로 구체화 요구) / 법근거제시(추궁 중 법령 조문 인용)

### 자기제기 이슈 신호 (KPI5용)
발언 중 의원이 스스로 제기한, 향후 추적 가능한 구체적 이슈(민원·요구·문제제기)를 짧은 설명으로
추출한다. 의례적 인사·단순 질의는 제외.

> ### ⚠️ 오해 방지 (매우 중요)
> 신호 추출은 **"의원이 비리 의심스러운가"를 판정하지 않는다.** 발언록에서 부패 정황이 발견된
> 경우, 그 대상은 **집행부 절차**이며 반드시 **"○○ 의원이 제기한 문제 제기"**로만 기록한다.
> 모순포착 태그는 **답변자(집행부)의 진술 간 모순**을 의원이 지적했다는 뜻이지, 의원 자신의
> 발언이 모순됐다는 뜻이 아니다.
```

- [ ] **Step 5: §3 8축 루브릭 → 5-KPI 정의로 교체**

원본 §3(96~247행) 전체를 아래로 교체(KPI별 산식·N/A조건·등급은 이 세션에서 사용자와 확정한 스펙 그대로):

```markdown
## 3. KPI 정의 (5개, 회의록 텍스트 전용)

채점은 **발언 단위**로 신호를 추출하고(KPI1~4), **의원 단위**로 누적 집계한다(KPI5).
5개 KPI는 절대 하나의 종합점수로 합산하지 않는다 — 단위가 서로 달라 산술 결합이 부적절하다.

KPI 순서(인과 사슬): **①준비하는가 → ②논의를 이끄는가 → ③물고 늘어지는가 → ④답변을 받아내는가 → ⑤끝까지 가는가**

---

### ① 근거밀도 (Evidence Density)

```
근거밀도 = (L법령조문 + S공식통계 + P검증가능출처 + F현장확인) 인용수 ÷ 발언시간(초) × 100
```

발언시간은 분모로만 쓴다(길게 말했다고 유리해지지 않도록 정규화). 발언시간 데이터가 없는
회의록에서는 발언 어절수 ÷ 상수로 근사하지 않고, 해당 통계 소스가 확보되기 전까지 N/A로 둔다.

| 근거밀도 | 등급 |
|---:|:---:|
| 3.0 이상 | A |
| 2.0–2.9 | B |
| 1.0–1.9 | C |
| 1.0 미만 | D |

---

### ② 대안구체성 (Solution Specificity)

```
대안구체성 = Σ(제안별 충족 요소 수, 0~4) ÷ 제안 건수
```

요소: 예산(규모·조달방안·절감 여부) / 시기(착수시점·연차) / 주체(담당 부서·기관 특정) /
방법(실행 단계 구체적 명시). 발언 내 제안이 0건이면 **N/A**(0점 아님).

---

### ③ 추궁심도 (Interrogation Depth)

```
추궁심도 = 질의 1건당 평균 왕복(round) 횟수 + 가산(모순포착+1.0/패턴제시+1.0/회피차단+0.5/법근거제시+0.5)
재질의율 = 재질의된 round 수 ÷ 총 질의 건수
```

§2 "질의응답 구조"가 없는 발언(순수 5분 이상 발언 등)은 **N/A**(0점 아님) — 추궁할 대상 자체가
없었다는 뜻이지 감시 능력이 없다는 뜻이 아니다.

---

### ④ 답변확보율 (Commitment Rate)

```
답변확보율 = Σ(round별 답변등급 점수) ÷ 총 질의 건수
확답 = 1.0 · 조건부 = 0.5 · 회피 = 0
```

③과 동일한 조건으로 질의응답 구조가 없으면 **N/A**.

> **회피 판정 예시(고정 패턴, 확답 요소 없이 이 표현만 있으면 회피)**: "검토하겠습니다",
> "노력하겠습니다", "살펴보겠습니다", "적극 반영하겠습니다", "고민해 보겠습니다".
> 이 표현이 있어도 시기/주체/방법 중 하나라도 구체적으로 딸려 있으면 확답 또는 조건부로 재분류한다.

---

### ⑤ 이슈지속추적률 (Issue Persistence)

```
이슈지속추적률 = 재검토된 자기제기 이슈 수 ÷ 총 자기제기 이슈 수   (의원 단위 누적, 발언 단위 아님)
```

나머지 4개 KPI가 "1회성 스냅숏"인 데 반해, 이것만 여러 회기에 걸친 실제 추적을 측정한다.
새 이슈는 §2에서 추출된 대로 "이슈 티켓"으로 등록하고, 이후 회기에서 동일 의원의 새 이슈 후보가
기존 미해결 티켓과 §4의 방식으로 매칭되면 그 티켓을 "재검토됨"으로 표시한다.

| 이슈지속추적률 | 등급 |
|---:|:---:|
| 60% 이상 | A |
| 40–59% | B |
| 20–39% | C |
| 20% 미만 | D |

이력이 3회기 미만으로 누적된 의원은 비율 대신 **"추적 중"**으로 표시한다(낮은 점수 아님).

---

### 부가 — 청렴 가산점 (독립 KPI 아님)

절차 위반 지적 + 법령 조문 특정(+1.0), 반복 패턴 제시(+1.0), 답변 모순 추궁(+0.5), 시정 조치
요구(+0.5)가 있으면 보조 배지로만 표시한다. 순위·등급에는 반영하지 않는다.
```

- [ ] **Step 6: §4를 가중치표에서 이슈 매칭 규칙으로 교체**

원본 §4(발언유형별 가중치, 249~278행) 전체를 삭제하고 아래로 교체:

```markdown
## 4. 이슈 지속 추적 — Opus 5 회기간 매칭 (KPI5 전용)

KPI5를 제외한 4개 KPI는 순수 코드로 계산되며 어떤 모델도 호출하지 않는다. Opus 5는 **오직**
"이번 회기 §2에서 추출된 새 이슈 후보가, 이 의원의 기존 미해결 이슈 티켓 중 하나와 동일 사안인가"
를 의미적으로 판단하는 데에만 쓰인다.

- 대상 의원에게 미해결(open) 이슈 티켓이 **없으면 Opus 5를 호출하지 않는다** — 비용 절감,
  KPI5는 자동으로 "추적 중" 또는 신규 티켓만 등록.
- Opus 5는 새 이슈 후보 설명과 기존 미해결 티켓 설명 목록을 받아, 매칭되는 티켓 ID(있다면)만
  반환한다. 표현이 다르더라도 같은 사안(같은 시설·같은 예산 항목·같은 정책)이면 매칭한다.
- 매칭되면 해당 티켓을 "재검토됨"으로 기록하고 새 이슈로는 등록하지 않는다. 매칭되지 않으면
  새 티켓으로 등록한다.
- **오판 방지**: 다른 의원이 제기한 이슈와는 절대 매칭하지 않는다(의원별로 티켓 목록을 분리
  조회). 확신이 낮으면 매칭시키지 말고 새 티켓으로 등록한다(거짓 재검토 방지가 거짓 신규보다 안전).
```

- [ ] **Step 7: §5 금지사항에 이슈매칭 오판 방지 조항 추가**

원본 §5.1 표(281~294행)에 다음 행 추가:

```markdown
| 9 | 다른 의원이 제기한 이슈를 본인이 제기한 것처럼 재검토 매칭하는 것 |
| 10 | 확신이 낮은 이슈 매칭을 강행해 실제로는 신규인 이슈를 "재검토됨"으로 잘못 표시하는 것 |
```

- [ ] **Step 8: §6 출력 포맷 — 표1/표2 컬럼을 5-KPI로 재정의**

원본 §6.1~6.3(JSON 스키마, 표1, 표2, 332~423행)을 아래로 교체:

```markdown
## 6. 출력 포맷

### 6.1 JSON 스키마 (기계 처리용)

```json
{
  "session": "회의 타이틀",
  "date": "YYYY-MM-DD",
  "evaluations": [
    {
      "member": "홍길동",
      "speechType": "five_min",
      "hasQaStructure": true,
      "citations": [{ "type": "L", "text": "..." }],
      "proposals": [{ "budget": true, "timeline": false, "subject": true, "method": true }],
      "qaRounds": [{ "roundIndex": 0, "answerGrade": "확답", "bonusTags": ["모순포착"] }],
      "selfRaisedIssues": [{ "description": "..." }],
      "kpis": {
        "evidenceDensity": { "value": 2.4, "grade": "B" },
        "solutionSpecificity": { "value": 3.0, "grade": null },
        "interrogationDepth": { "value": 1.8, "reQuestionRate": 0.5, "grade": null },
        "commitmentRate": { "value": 0.75, "grade": null },
        "issuePersistence": { "value": null, "status": "tracking" }
      }
    }
  ]
}
```

### 6.2 표1 — 회의 단위 평가표

```
### 표1. [회의 타이틀]

| 의원 | 주제 | 태그 | 근거밀도 | 대안구체성 | 추궁심도 | 답변확보율 |
|---|---|---|:--:|:--:|:--:|:--:|
| [홍길동](#홍길동) | ... | `#태그1` | 2.4(B) | 3.0 | 1.8 | 75% |
```

- 5개 KPI는 각각 독립 컬럼으로 표시하고 종합 순위점수는 만들지 않는다.
- KPI3·4가 N/A인 행은 "―"로 표기(질의응답 구조 없음).
- 이슈지속추적률은 회의 단위가 아닌 의원 누적치이므로 표1에는 넣지 않고 표2에서만 노출한다.

### 6.3 표2 — 의원별 발언 요약

```
### 표2. {의원명}

**발언 요약**: ...
**인용 근거**: L/S/P/F 유형별 목록
**제안 요소 체크**: 예산/시기/주체/방법 충족 여부
**질의응답 왕복**: round별 답변등급·가산태그
**이슈 지속 추적**: 신규 등록/재검토된 티켓 목록, 누적 이슈지속추적률(또는 "추적 중")
```
```

- [ ] **Step 9: §7 파일럿 예시를 5-KPI로 재작성**

원본 §7(제264회 파일럿, 440~517행)을 아래 안내 문구로 교체(정확한 원본 수치는 인코딩 손상으로
일부 유실되었으므로, 새로 산출하지 않고 향후 실제 재처리 결과로 채운다는 점을 명시):

```markdown
## 7. 파일럿 결과

> v1.1의 §7은 8축 가중평균 예시였으나 5-KPI 체계와는 산식이 근본적으로 달라 재사용할 수 없다.
> 제264회 임시회 예산결산특별위원회(2026-07-31) 7인 데이터를 5-KPI로 재처리한 결과는
> Task 10(DB 마이그레이션) 이후 실제 파이프라인 재실행으로 채운다. 이 섹션은 재처리 완료 후
> 실측값으로 갱신한다(플레이스홀더 수치를 임의로 채워 넣지 않는다).
```

- [ ] **Step 10: §8 로드맵, §9 변경이력 갱신**

§8 로드맵 표에 "P0 | 5-KPI 파이프라인 전환 완료 후 제264회 재처리 | v2.0 전환의 실측 검증"
행을 추가. §9 변경이력 표 마지막에 다음 행 추가:

```markdown
| **v2.0** | 2026-08-11 | **8축 가중평균 주관채점 체계를 폐기하고 5-KPI(근거밀도·대안구체성·추궁심도·답변확보율·이슈지속추적률) 체계로 전면 교체.** 종합 순위점수 폐지, 5개 KPI 항상 독립 표시. 발언유형별 가중치표 폐지 — KPI3·4 N/A는 발언유형이 아닌 "질의응답 구조 존재 여부"로 동적 판정. Opus5 역할을 8축 채점에서 KPI5(이슈지속추적률) 회기간 매칭 전담으로 축소. `docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md`로 제품 반영 스펙 분리. |
```

- [ ] **Step 11: 확인**

`docs/rubric/CLAUDE.md`를 처음부터 끝까지 읽고, "8축"·"가중평균"·"창의성"·"실현가능성"·
"오프셋" 등 옛 체계 잔존 문구가 §0~§9 어디에도 남아있지 않은지 확인(부록 A/B/C/D는 8축 시절
근거로 작성되었으므로 부록도 5-KPI 맥락으로 다시 확인·필요시 삭제).

- [ ] **Step 12: Commit**

```bash
git add docs/rubric/CLAUDE.md
git commit -m "docs(rubric): replace 8-axis weighted rubric with 5-KPI transcript-only system (v2.0)"
```

---

## Task 2: 설계 스펙 문서 작성 및 구 스펙/계획 대체 표시

**Files:**
- Create: `docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md`
- Modify: `docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md` (상단에 대체 고지 추가)
- Modify: `docs/superpowers/plans/2026-08-07-gjcl-member-evaluation-rubric-plan.md` (상단에 대체 고지 추가)

**Interfaces:**
- Consumes: Task 1의 루브릭 v2.0 전문.
- Produces: 없음(문서 전용).

- [ ] **Step 1: 신규 설계 스펙 작성**

`docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md`를 다음 내용으로 생성한다
(이 세션의 Context, 5-KPI 표, 아키텍처 결정을 그대로 옮긴다):

```markdown
# 거제시의회 의정활동 평가 — 8축 → 5-KPI 회의록 전용 지표 전환 Design Spec

**Date:** 2026-08-11
**Status:** Approved
**Supersedes:** `docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md`(8축 체계)
**루브릭 원문:** 리포지토리 루트 `docs/rubric/CLAUDE.md` (v2.0)

## 0. 배경

사용자가 업로드한 `회의록기반_핵심KPI_5선.md`는 "회의록 텍스트 단독으로 계산 가능한 지표만
채택한다"는 원칙 아래 5개 KPI(근거밀도·대안구체성·추궁심도·답변확보율·이슈지속추적률)를
제안했다. 업로드 파일은 한글 본문이 인코딩 손상(mojibake)되어 있었으나 영문 병기·수식·표
구조·등급 기준은 온전히 판독되었고, 재구성 내용을 사용자가 확인·승인했다.

기존 8축 가중평균 루브릭(v1.1)은 `backend/`(스코어링 파이프라인·DB)와 `mobile/`(3-탭
인사이트 UI)에 이미 완전히 구현되어 있었다(2026-08-06~08-10 커밋). 이번 전환은 이를
완전히 대체한다.

## 1. 확정된 핵심 결정

1. 8축을 5-KPI로 완전 대체.
2. 종합 순위점수 없음 — 5개 KPI 독립 표시(단위가 서로 달라 산술 합산 부적절).
3. 모델 역할: Sonnet5 = 신호 추출 전담, Opus5 = 회기간 이슈 매칭(KPI5)에만 사용, 수치는
   순수 코드로 계산.

## 2. KPI 정의

(docs/rubric/CLAUDE.md §3 참조 — 근거밀도/대안구체성/추궁심도/답변확보율/이슈지속추적률의
산식·N/A조건·등급 경계값은 루브릭 원문이 단일 진실 소스다.)

## 3. 아키텍처

- 질의응답 구조 판정: 스크래퍼(`backend/scripts/scrape/minutes.ts`)가 의원·집행부 턴을
  모두 `statements`에 순서대로(`orderInMeeting`) 저장해 두므로, 현재 statement 이후 다음
  **의원** statement 전까지의 집행부/사무국 턴(`isNonMemberSpeaker`) 존재 여부로 동적 판정한다.
- Sonnet5 추출 → 순수 코드 KPI1~4 계산 → (미해결 티켓 있으면) Opus5 이슈매칭 → KPI5 집계.
- KPI5는 발언 단위가 아닌 의원 누적 단위이므로 신규 테이블 `issueTickets`/`issueReviews`로
  관리하고 쿼리 레이어(`insights.ts`)에서 계산한다.

## 4. 데이터 모델

`backend/db/schema.ts`의 `statementInsights`에서 8축 컬럼을 제거하고 KPI 관련 컬럼으로
교체(정확한 컬럼명은 Task 10 참조). 신규 `issueTickets`(memberId, description,
registeredStatementId/MeetingId, status) + `issueReviews`(ticketId, reviewedStatementId/MeetingId).

## 5. UI 매핑

3-탭 구조(개요/세부항목/전체의원랭킹)와 표2 상세화면 패턴은 유지하되, "가중평균 단일 정렬"을
KPI 선택 드롭다운 정렬로 교체한다. 이슈지속추적률은 의원 누적치라 전체의원랭킹 탭 또는 표2에서만
노출한다. 상세 스펙은 Task 14~18(구현 계획) 참조.

## 6. Non-Goals

- 실제 264회 파일럿 재처리 수치의 사전 확정 (재처리 후 실측값으로 `docs/rubric/CLAUDE.md`
  §7을 채운다 — Task 1 Step 9 참조)
- 청렴 가산점의 독립 KPI화 (보조 배지로만 유지)
```

- [ ] **Step 2: 구 스펙 문서에 대체 고지 추가**

`docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md` 최상단(1행 바로
아래)에 삽입:

```markdown
> **⚠️ 대체됨 (2026-08-11)**: 이 문서가 다루는 8축 가중평균 루브릭은
> `docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md`의 5-KPI 체계로 완전히
> 대체되었다. 이 문서는 역사적 기록으로만 보존한다.
```

- [ ] **Step 3: 구 계획 문서에 대체 고지 추가**

`docs/superpowers/plans/2026-08-07-gjcl-member-evaluation-rubric-plan.md` 최상단(1행 바로
아래)에 삽입:

```markdown
> **⚠️ 대체됨 (2026-08-11)**: 이 계획(8축 전환, 미착수 상태로 종료)은
> `docs/superpowers/plans/2026-08-11-gjcl-5kpi-rubric-plan.md`로 대체되었다.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md docs/superpowers/specs/2026-08-07-gjcl-member-evaluation-rubric-design.md docs/superpowers/plans/2026-08-07-gjcl-member-evaluation-rubric-plan.md
git commit -m "docs(specs): add 5-KPI design spec, mark 8-axis spec/plan as superseded"
```

---

## Task 3: 루트 `CLAUDE.md`·`Design.md`·`agent.md` 8축 서술 갱신

**Files:**
- Modify: `CLAUDE.md` (반드시 지켜야 할 규칙 섹션의 평점 척도 문구)
- Modify: `Design.md` (8축/가중평균 언급이 있으면 갱신)
- Modify: `agent.md` (8축/가중평균 언급이 있으면 갱신)

**Interfaces:**
- Consumes: Task 1 §3 KPI 정의.
- Produces: 없음(문서 전용).

- [ ] **Step 1: 루트 `CLAUDE.md`의 평점 척도 문구 교체**

루트 `CLAUDE.md`의 "반드시 지켜야 할 규칙" 섹션에서 다음 줄:

```
- 평점 척도는 8개 축 모두 정수 1~5 (단, 창의성은 예산·결산 심의 발언유형에서, 지속성은 이전 회기 인용 근거가 없는 경우 `null`이 될 수 있다 — `docs/rubric/CLAUDE.md` §3·§4 참조). 최종 점수는 축별 단순평균이 아닌 발언유형별 가중평균이다.
```

를 다음으로 교체:

```
- 평가지표는 회의록 텍스트만으로 계산 가능한 5개 KPI(근거밀도·대안구체성·추궁심도·답변확보율·이슈지속추적률)이며, 종합 순위점수로 합산하지 않고 항상 독립적으로 표시한다 — `docs/rubric/CLAUDE.md` §3 참조. KPI3(추궁심도)·KPI4(답변확보율)는 해당 발언 직후 질의응답 구조가 없으면 `N/A`, KPI2(대안구체성)는 발언 내 제안이 0건이면 `N/A`, KPI5(이슈지속추적률)는 3회기 미만 이력이면 "추적 중"으로 표기한다.
```

- [ ] **Step 2: `Design.md`, `agent.md` 검토**

`Design.md`와 `agent.md`에서 "8축", "가중평균", "창의성·실현가능성·근거법적·지속성·견제력·
시민체감·미래전략·거제발전" 문구를 검색해, 존재하면 Task 1 §3의 5-KPI 명칭·산식으로 교체한다.
두 파일 모두 v1.1 8축 도입(2026-08-07) 이전에 작성되었을 가능성이 있으므로, 8축 관련 서술이
전혀 없다면 이 파일들은 수정하지 않는다(존재하지 않는 문제를 고치지 않는다).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md Design.md agent.md
git commit -m "docs: update root CLAUDE.md rating-scale rule to 5-KPI system"
```

---

## Task 4: Sonnet5 신호 추출 스키마 확장 — 인용·제안요소·자기제기이슈

**Files:**
- Modify: `backend/lib/ai/summarize.ts`
- Test: `backend/lib/ai/summarize.test.ts` (신규, 기존 파일 없으면 생성)

**Interfaces:**
- Consumes: 없음.
- Produces: `SummaryResult`에 `citations: Citation[]`, `proposals: Proposal[]`,
  `selfRaisedIssues: SelfRaisedIssue[]` 추가. 타입:
  ```ts
  export interface Citation { type: "L" | "S" | "P" | "F"; text: string }
  export interface Proposal { budget: boolean; timeline: boolean; subject: boolean; method: boolean }
  export interface SelfRaisedIssue { description: string }
  ```
  Task 8(`processStatement.ts`)이 이 필드들을 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/lib/ai/summarize.test.ts`:

```ts
import { test, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      summary: "요약",
      tags: ["태그1", "태그2"],
      isProcedural: false,
      speechType: "budget_review",
      citations: [{ type: "L", text: "지방재정법 제17조 제2항" }],
      proposals: [{ budget: true, timeline: false, subject: true, method: true }],
      selfRaisedIssues: [{ description: "보조금 집행 절차 준수 여부 확인 필요" }],
    },
  }),
}));

import { summarizeStatement } from "./summarize";

test("returns citations, proposals, selfRaisedIssues alongside existing fields", async () => {
  const result = await summarizeStatement("발언 원문", "안건명");

  expect(result.citations).toEqual([{ type: "L", text: "지방재정법 제17조 제2항" }]);
  expect(result.proposals).toEqual([{ budget: true, timeline: false, subject: true, method: true }]);
  expect(result.selfRaisedIssues).toEqual([{ description: "보조금 집행 절차 준수 여부 확인 필요" }]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run lib/ai/summarize.test.ts`
Expected: FAIL — `result.citations` is `undefined` (스키마에 필드가 아직 없음)

- [ ] **Step 3: `SummarySchema` 확장 구현**

`backend/lib/ai/summarize.ts`의 `SummarySchema`(11~28행)를 다음으로 교체(기존 `summary`/
`tags`/`isProcedural`/`speechType` 필드는 그대로 유지):

```ts
const CitationSchema = z.object({
  type: z.enum(["L", "S", "P", "F"]).describe(
    "L=법률명+조항 특정, S=수치+기준연도/출처 명시, P=지자체명+사업명 특정, F=방문·사진·직접관찰 언급"
  ),
  text: z.string().describe("인용 부분의 원문 발췌"),
});

const ProposalSchema = z.object({
  budget: z.boolean().describe("예산 규모·조달방안·절감 여부가 구체적으로 언급되었는가"),
  timeline: z.boolean().describe("착수시점·연차 등 시기가 구체적으로 언급되었는가"),
  subject: z.boolean().describe("담당 부서·기관이 특정되었는가"),
  method: z.boolean().describe("실행 단계·방법이 구체적으로 명시되었는가"),
});

const SelfRaisedIssueSchema = z.object({
  description: z.string().describe("의원이 스스로 제기한, 향후 추적 가능한 구체적 이슈 설명"),
});

const SummarySchema = z.object({
  summary: z.string().describe("발언의 핵심 내용을 2-3문장으로 요약"),
  tags: z.array(z.string()).min(2).max(4).describe("발언의 핵심 주제를 나타내는 짧은 한국어 태그"),
  isProcedural: z
    .boolean()
    .describe(
      "의장·부의장의 개회/폐회 선언, 안건 상정·가결 공지, 회기 결정, 휴회·산회 선포, 국민의례·묵념 안내, " +
        "위원회 구성 발표 등 순수 의사진행 절차 발언이면 true. 정책 의견, 질의, 제안, 실질적 내용이 조금이라도 " +
        "있으면 false (예: 개회사에 정책 방향이나 당부가 담겨 있으면 false)"
    ),
  speechType: z
    .enum(SPEECH_TYPES)
    .describe(
      "발언 유형 분류. budget_review: 예산·결산·추경·기금운용계획 심의 관련 발언. " +
        "admin_audit: 행정사무감사 관련 발언. ordinance_proposal: 조례 제정·개정안 발안·설명 관련 발언. " +
        "five_min: 그 외 일반 본회의 발언(개회사, 시정질문 등 위 세 범주에 해당하지 않는 모든 발언)"
    ),
  citations: z.array(CitationSchema).describe("발언 중 법령조문·공식통계·검증가능출처·현장확인 인용 목록"),
  proposals: z.array(ProposalSchema).describe("발언에 담긴 각 제안의 4요소 충족 여부 (제안이 없으면 빈 배열)"),
  selfRaisedIssues: z.array(SelfRaisedIssueSchema).describe("의원이 스스로 제기한 향후 추적 가능한 이슈 목록"),
});

export interface Citation { type: "L" | "S" | "P" | "F"; text: string }
export interface Proposal { budget: boolean; timeline: boolean; subject: boolean; method: boolean }
export interface SelfRaisedIssue { description: string }

export interface SummaryResult {
  summary: string;
  tags: string[];
  isProcedural: boolean;
  speechType: SpeechType;
  citations: Citation[];
  proposals: Proposal[];
  selfRaisedIssues: SelfRaisedIssue[];
}
```

`summarizeStatement`의 프롬프트(37~47행)에 한 줄 추가:

```ts
export async function summarizeStatement(rawText: string, agendaTitle?: string | null): Promise<SummaryResult> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: SummarySchema,
    prompt: `다음은 거제시의회 의원의 발언 원문입니다. 핵심 내용을 요약하고, 발언의 주제를 나타내는 짧은 태그를 2~4개 생성하세요. 또한 이 발언이 순수 의사진행 절차 발언인지 판별하고, 발언 유형을 분류하세요. 추가로 발언 중 법령조문·공식통계·검증가능출처·현장확인 인용, 제안의 4요소(예산·시기·주체·방법) 충족 여부, 의원이 스스로 제기한 향후 추적 가능한 이슈를 회의록에 명시된 내용만 근거로 추출하세요.
${agendaTitle ? `\n안건명(참고용): ${agendaTitle}\n` : ""}
발언 원문:
${rawText}`,
  });
  return object;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run lib/ai/summarize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/lib/ai/summarize.ts backend/lib/ai/summarize.test.ts
git commit -m "feat(ai): extract citations, proposal elements, self-raised issues in Sonnet5 summarize stage"
```

---

## Task 5: 질의응답 구조 판정 + 왕복(round) 신호 추출

**Files:**
- Create: `backend/lib/ai/extractQaRounds.ts`
- Test: `backend/lib/ai/extractQaRounds.test.ts`

**Interfaces:**
- Consumes: `isNonMemberSpeaker`(`backend/lib/members/isNonMemberSpeaker.ts`, 기존).
- Produces:
  ```ts
  export interface QaRound { roundIndex: number; answerGrade: "확답" | "조건부" | "회피"; bonusTags: string[] }
  export function hasQaStructure(followingSpeakerNames: string[]): boolean
  export async function extractQaRounds(questionText: string, answerTexts: string[]): Promise<QaRound[]>
  ```
  `hasQaStructure`는 순수 함수(코드로 판정, LLM 없음) — Task 8이 이걸로 먼저 N/A 여부를 정하고,
  구조가 있을 때만 `extractQaRounds`(Sonnet5)를 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성 (hasQaStructure)**

`backend/lib/ai/extractQaRounds.test.ts`:

```ts
import { test, expect, vi } from "vitest";
import { hasQaStructure } from "./extractQaRounds";

test("returns true when a staff/executive speaker follows before the next member turn", () => {
  expect(hasQaStructure(["부시장 민기식", "홍길동"])).toBe(true);
});

test("returns false when the very next turn is already another member", () => {
  expect(hasQaStructure(["김미영"])).toBe(false);
});

test("returns false for an empty list (last statement in the meeting)", () => {
  expect(hasQaStructure([])).toBe(false);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run lib/ai/extractQaRounds.test.ts`
Expected: FAIL — `extractQaRounds.ts` 파일이 존재하지 않음

- [ ] **Step 3: `hasQaStructure` 구현**

`backend/lib/ai/extractQaRounds.ts` 생성:

```ts
import { generateObject } from "ai";
import { z } from "zod";
import { isNonMemberSpeaker } from "@/lib/members/isNonMemberSpeaker";

/**
 * "다음 의원 턴이 나오기 전까지" 순서로 넘어온 화자 이름 목록에서, 그 중 하나라도
 * 집행부/사무국(비의원) 화자면 질의응답 구조가 있다고 판정한다. 호출부(processStatement.ts)가
 * 이미 "다음 의원 턴 전까지"로 잘라서 넘기므로, 여기서는 순서를 다시 따지지 않는다.
 */
export function hasQaStructure(followingSpeakerNames: string[]): boolean {
  return followingSpeakerNames.some((name) => isNonMemberSpeaker(name));
}

const QaRoundSchema = z.object({
  roundIndex: z.number().int().min(0),
  answerGrade: z
    .enum(["확답", "조건부", "회피"])
    .describe(
      "확답: 시기/주체/방법 중 2개 이상 구체적으로 명시. 조건부: 조건부 약속. " +
        "회피: '검토하겠습니다'·'노력하겠습니다'·'살펴보겠습니다' 류로 구체성 없음"
    ),
  bonusTags: z
    .array(z.enum(["모순포착", "패턴제시", "회피차단", "법근거제시"]))
    .describe(
      "모순포착: 답변이 이전 진술과 모순됨을 의원이 지적. 패턴제시: 단발이 아닌 반복 구조로 제시. " +
        "회피차단: 회피성 답변에 재질의로 구체화 요구. 법근거제시: 추궁 중 법령 조문 인용"
    ),
});

export interface QaRound {
  roundIndex: number;
  answerGrade: "확답" | "조건부" | "회피";
  bonusTags: string[];
}

export async function extractQaRounds(questionText: string, answerTexts: string[]): Promise<QaRound[]> {
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: z.object({ rounds: z.array(QaRoundSchema) }),
    prompt: `다음은 거제시의회 의원의 질의와 집행부 답변입니다. 답변마다 등급(확답/조건부/회피)을 매기고, 해당되는 가산 태그가 있으면 표시하세요. 회의록에 명시되지 않은 내용은 추측하지 마세요.

의원 질의:
${questionText}

집행부 답변(순서대로):
${answerTexts.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
  });
  return object.rounds;
}
```

- [ ] **Step 4: 테스트 통과 확인 (hasQaStructure)**

Run: `cd backend && npx vitest run lib/ai/extractQaRounds.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: `extractQaRounds`용 테스트 추가**

같은 파일에 추가:

```ts
vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { rounds: [{ roundIndex: 0, answerGrade: "회피", bonusTags: ["회피차단"] }] },
  }),
}));
```

파일 상단(다른 import 앞)으로 이동시키고, 아래 테스트를 추가:

```ts
import { extractQaRounds } from "./extractQaRounds";

test("extractQaRounds returns classified rounds from the mocked model", async () => {
  const rounds = await extractQaRounds("보조금 집행 절차를 준수했습니까?", ["검토하겠습니다."]);
  expect(rounds).toEqual([{ roundIndex: 0, answerGrade: "회피", bonusTags: ["회피차단"] }]);
});
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && npx vitest run lib/ai/extractQaRounds.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/lib/ai/extractQaRounds.ts backend/lib/ai/extractQaRounds.test.ts
git commit -m "feat(ai): add Q&A structure detection and round extraction for KPI3/4"
```

---

## Task 6: Opus5 회기간 이슈 매칭

**Files:**
- Create: `backend/lib/ai/matchIssues.ts`
- Delete: `backend/lib/ai/score.ts`, `backend/lib/ai/score.test.ts` (있다면)
- Test: `backend/lib/ai/matchIssues.test.ts`

**Interfaces:**
- Consumes: 없음(독립 모듈).
- Produces:
  ```ts
  export interface OpenTicket { id: number; description: string }
  export interface IssueMatchResult { newIssueIndex: number; matchedTicketId: number | null }
  export async function matchIssues(newIssues: string[], openTickets: OpenTicket[]): Promise<IssueMatchResult[]>
  ```
  Task 8이 `openTickets.length === 0`이면 이 함수를 호출하지 않는다(§4 비용 절감 규칙).

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/lib/ai/matchIssues.test.ts`:

```ts
import { test, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { matches: [{ newIssueIndex: 0, matchedTicketId: 12 }, { newIssueIndex: 1, matchedTicketId: null }] },
  }),
}));

import { matchIssues } from "./matchIssues";

test("returns matched ticket id per new issue, null when no match", async () => {
  const result = await matchIssues(
    ["실내빙상관 공백 해소 진행 상황 재확인", "새로운 이슈"],
    [{ id: 12, description: "실내빙상관 유사시설 중복 여부 점검" }]
  );

  expect(result).toEqual([
    { newIssueIndex: 0, matchedTicketId: 12 },
    { newIssueIndex: 1, matchedTicketId: null },
  ]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run lib/ai/matchIssues.test.ts`
Expected: FAIL — `matchIssues.ts` 파일이 존재하지 않음

- [ ] **Step 3: 구현**

`backend/lib/ai/matchIssues.ts` 생성(기존 `score.ts`의 Vertex 429 회피용 `providerOptions.gateway.order`
설정을 그대로 계승):

```ts
import { generateObject } from "ai";
import { z } from "zod";

export interface OpenTicket {
  id: number;
  description: string;
}

export interface IssueMatchResult {
  newIssueIndex: number;
  matchedTicketId: number | null;
}

const MatchSchema = z.object({
  matches: z.array(
    z.object({
      newIssueIndex: z.number().int().min(0),
      matchedTicketId: z
        .number()
        .int()
        .nullable()
        .describe("동일 사안이면 그 티켓 id, 아니면 null. 확신이 낮으면 반드시 null(신규로 처리)."),
    })
  ),
});

export async function matchIssues(newIssues: string[], openTickets: OpenTicket[]): Promise<IssueMatchResult[]> {
  const { object } = await generateObject({
    model: "anthropic/claude-opus-5",
    providerOptions: {
      gateway: {
        order: ["anthropic", "claudeaws", "bedrock"],
      },
    },
    schema: MatchSchema,
    prompt: `아래는 한 거제시의회 의원이 이번 회기에 새로 제기한 이슈 목록과, 이 의원이 과거 회기에 제기해 아직 미해결인 이슈 티켓 목록입니다. 새 이슈 각각이 기존 미해결 티켓 중 하나와 같은 사안(같은 시설·같은 예산 항목·같은 정책)을 다시 제기하는 것인지 판단하세요. 표현이 다르더라도 같은 사안이면 매칭하되, 확신이 낮으면 반드시 null(신규 이슈)로 처리하세요. 이 의원이 아닌 다른 의원의 이슈와는 절대 매칭하지 마세요(아래 목록은 이미 이 의원 것만 걸러져 있습니다).

이번 회기 새 이슈:
${newIssues.map((issue, i) => `${i}. ${issue}`).join("\n")}

기존 미해결 티켓:
${openTickets.map((t) => `id=${t.id}: ${t.description}`).join("\n")}`,
  });
  return object.matches;
}
```

`backend/lib/ai/score.ts`와 그 테스트(있다면)는 삭제한다 — 8축 채점은 5-KPI 체계에서 쓰이지
않는다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run lib/ai/matchIssues.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git rm backend/lib/ai/score.ts
git add backend/lib/ai/matchIssues.ts backend/lib/ai/matchIssues.test.ts
git commit -m "feat(ai): replace 8-axis Opus5 scoring with cross-session issue matching"
```

---

## Task 7: KPI 계산 유틸 (순수 코드)

**Files:**
- Create: `backend/lib/scoring/kpi.ts`
- Delete: `backend/lib/scoring/weightedAverage.ts`, `backend/lib/scoring/weightedAverage.test.ts`
- Test: `backend/lib/scoring/kpi.test.ts`

**Interfaces:**
- Consumes: `Citation`/`Proposal`(Task 4), `QaRound`(Task 5).
- Produces:
  ```ts
  export type Grade = "A" | "B" | "C" | "D";
  export function computeEvidenceDensity(citations: Citation[], speechDurationSec: number | null): { value: number | null; grade: Grade | null }
  export function computeSolutionSpecificity(proposals: Proposal[]): number | null
  export function computeInterrogationDepth(qaRounds: QaRound[]): { value: number; reQuestionRate: number } | null
  export function computeCommitmentRate(qaRounds: QaRound[]): number | null
  export function computeIssuePersistenceGrade(rate: number): Grade
  ```
  Task 8이 이 함수들을 그대로 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/lib/scoring/kpi.test.ts`:

```ts
import { test, expect } from "vitest";
import {
  computeEvidenceDensity,
  computeSolutionSpecificity,
  computeInterrogationDepth,
  computeCommitmentRate,
  computeIssuePersistenceGrade,
} from "./kpi";

test("computeEvidenceDensity: 4 citations over 100s = 4.0 density, grade A", () => {
  const citations = [
    { type: "L" as const, text: "a" },
    { type: "S" as const, text: "b" },
    { type: "P" as const, text: "c" },
    { type: "F" as const, text: "d" },
  ];
  expect(computeEvidenceDensity(citations, 100)).toEqual({ value: 4.0, grade: "A" });
});

test("computeEvidenceDensity: grade boundaries B/C/D", () => {
  const oneCitation = [{ type: "L" as const, text: "a" }];
  expect(computeEvidenceDensity(oneCitation, 40).grade).toBe("B"); // 2.5
  expect(computeEvidenceDensity(oneCitation, 80).grade).toBe("C"); // 1.25
  expect(computeEvidenceDensity(oneCitation, 200).grade).toBe("D"); // 0.5
});

test("computeEvidenceDensity: null speech duration returns null (not approximated)", () => {
  expect(computeEvidenceDensity([{ type: "L", text: "a" }], null)).toEqual({ value: null, grade: null });
});

test("computeSolutionSpecificity: averages element counts across proposals", () => {
  const proposals = [
    { budget: true, timeline: true, subject: true, method: false }, // 3
    { budget: true, timeline: false, subject: false, method: false }, // 1
  ];
  expect(computeSolutionSpecificity(proposals)).toBe(2.0);
});

test("computeSolutionSpecificity: no proposals returns null (N/A, not 0)", () => {
  expect(computeSolutionSpecificity([])).toBeNull();
});

test("computeInterrogationDepth: 2 rounds, one bonus tag", () => {
  const rounds = [
    { roundIndex: 0, answerGrade: "회피" as const, bonusTags: ["회피차단"] },
    { roundIndex: 1, answerGrade: "확답" as const, bonusTags: [] },
  ];
  const result = computeInterrogationDepth(rounds);
  expect(result?.value).toBe(2.5); // 2 rounds + 0.5 bonus
  expect(result?.reQuestionRate).toBe(1); // 2 rounds / 1 question(round 0's re-question is round 1)
});

test("computeInterrogationDepth: no rounds (no Q&A structure) returns null", () => {
  expect(computeInterrogationDepth([])).toBeNull();
});

test("computeCommitmentRate: mixed grades average to 0.5", () => {
  const rounds = [
    { roundIndex: 0, answerGrade: "확답" as const, bonusTags: [] },
    { roundIndex: 1, answerGrade: "회피" as const, bonusTags: [] },
  ];
  expect(computeCommitmentRate(rounds)).toBe(0.5);
});

test("computeCommitmentRate: no rounds returns null", () => {
  expect(computeCommitmentRate([])).toBeNull();
});

test("computeIssuePersistenceGrade: boundary values", () => {
  expect(computeIssuePersistenceGrade(0.6)).toBe("A");
  expect(computeIssuePersistenceGrade(0.4)).toBe("B");
  expect(computeIssuePersistenceGrade(0.2)).toBe("C");
  expect(computeIssuePersistenceGrade(0.19)).toBe("D");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run lib/scoring/kpi.test.ts`
Expected: FAIL — `kpi.ts` 파일이 존재하지 않음

- [ ] **Step 3: 구현**

`backend/lib/scoring/kpi.ts` 생성:

```ts
import type { Citation, Proposal } from "@/lib/ai/summarize";
import type { QaRound } from "@/lib/ai/extractQaRounds";

export type Grade = "A" | "B" | "C" | "D";

function densityGrade(value: number): Grade {
  if (value >= 3.0) return "A";
  if (value >= 2.0) return "B";
  if (value >= 1.0) return "C";
  return "D";
}

/** docs/rubric/CLAUDE.md §3① — 발언시간이 없으면 근사하지 않고 N/A. */
export function computeEvidenceDensity(
  citations: Citation[],
  speechDurationSec: number | null
): { value: number | null; grade: Grade | null } {
  if (speechDurationSec === null || speechDurationSec === 0) return { value: null, grade: null };
  const value = (citations.length / speechDurationSec) * 100;
  return { value: Math.round(value * 100) / 100, grade: densityGrade(value) };
}

/** docs/rubric/CLAUDE.md §3② — 제안 0건이면 N/A(0점 아님). */
export function computeSolutionSpecificity(proposals: Proposal[]): number | null {
  if (proposals.length === 0) return null;
  const total = proposals.reduce(
    (sum, p) => sum + Number(p.budget) + Number(p.timeline) + Number(p.subject) + Number(p.method),
    0
  );
  return Math.round((total / proposals.length) * 100) / 100;
}

const BONUS_TAG_WEIGHT: Record<string, number> = {
  모순포착: 1.0,
  패턴제시: 1.0,
  회피차단: 0.5,
  법근거제시: 0.5,
};

/** docs/rubric/CLAUDE.md §3③ — 질의응답 구조 없으면(rounds 빈 배열) N/A. */
export function computeInterrogationDepth(qaRounds: QaRound[]): { value: number; reQuestionRate: number } | null {
  if (qaRounds.length === 0) return null;
  const bonus = qaRounds.reduce(
    (sum, r) => sum + r.bonusTags.reduce((s, tag) => s + (BONUS_TAG_WEIGHT[tag] ?? 0), 0),
    0
  );
  const reQuestioned = Math.max(qaRounds.length - 1, 0); // round 0 is the initial question; rounds after it are re-questions
  return {
    value: Math.round((qaRounds.length + bonus) * 100) / 100,
    reQuestionRate: Math.round((reQuestioned / qaRounds.length) * 100) / 100,
  };
}

const ANSWER_GRADE_SCORE: Record<QaRound["answerGrade"], number> = {
  확답: 1.0,
  조건부: 0.5,
  회피: 0,
};

/** docs/rubric/CLAUDE.md §3④ — 질의응답 구조 없으면 N/A. */
export function computeCommitmentRate(qaRounds: QaRound[]): number | null {
  if (qaRounds.length === 0) return null;
  const total = qaRounds.reduce((sum, r) => sum + ANSWER_GRADE_SCORE[r.answerGrade], 0);
  return Math.round((total / qaRounds.length) * 100) / 100;
}

/** docs/rubric/CLAUDE.md §3⑤ 등급 경계값. */
export function computeIssuePersistenceGrade(rate: number): Grade {
  if (rate >= 0.6) return "A";
  if (rate >= 0.4) return "B";
  if (rate >= 0.2) return "C";
  return "D";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run lib/scoring/kpi.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: Commit**

```bash
git rm backend/lib/scoring/weightedAverage.ts backend/lib/scoring/weightedAverage.test.ts
git add backend/lib/scoring/kpi.ts backend/lib/scoring/kpi.test.ts
git commit -m "feat(scoring): replace 8-axis weighted average with pure-code 5-KPI computation"
```

---

## Task 8: DB 마이그레이션 — `statementInsights` 재정의 + `issueTickets`/`issueReviews`

**Files:**
- Modify: `backend/db/schema.ts`
- Create: Drizzle migration (via `npx drizzle-kit generate`)

**Interfaces:**
- Consumes: Task 4~7의 타입(`Citation`, `Proposal`, `QaRound`, `SelfRaisedIssue`).
- Produces: 새 `statementInsights` 컬럼 이름(Task 9가 그대로 사용): `citations`, `kpiEvidenceDensity`,
  `kpiEvidenceDensityGrade`, `proposals`, `kpiSolutionSpecificity`, `qaRounds`,
  `kpiInterrogationDepth`, `kpiReQuestionRate`, `kpiCommitmentRate`, `selfRaisedIssues`,
  `rubricVersion`. 신규 테이블 `issueTickets`, `issueReviews`(Task 9·10이 사용).

- [ ] **Step 1: 실측 데이터 확인 (마이그레이션 전 필수 선행 작업)**

Run: `cd backend && npx tsx -e "import { db } from './db/client'; import { statementInsights } from './db/schema'; import { count } from 'drizzle-orm'; db.select({ n: count() }).from(statementInsights).then(r => console.log(r[0].n));"`

이 값이 0이 아니면, 사용자에게 "기존 8축 채점 데이터 N건은 5-KPI로 환산 불가능해 전량
재처리가 필요합니다"라고 알리고 진행 여부를 확인한 뒤 다음 단계로 넘어간다(자동으로 삭제하지
않는다 — 마이그레이션 자체가 컬럼을 바꾸므로 재처리 없이는 어차피 옛 값을 읽을 수 없게 된다는
점만 사전 고지).

- [ ] **Step 2: `schema.ts` 수정**

`backend/db/schema.ts`의 `statementInsights`(49~76행) 정의를 아래로 교체:

```ts
// 5-KPI 회의록 전용 지표 체계 per docs/rubric/CLAUDE.md v2.0 (§3/§6). 8축 가중평균 체계를
// 대체 — see docs/superpowers/specs/2026-08-11-gjcl-5kpi-rubric-design.md.
export const statementInsights = pgTable("statement_insights", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").notNull().references(() => statements.id).unique(),
  summary: text("summary").notNull(), // Sonnet 5 output
  tags: jsonb("tags").$type<string[]>().notNull(), // Sonnet 5 output
  excludedReason: text("excluded_reason"), // "의사진행 발언" | "의원 아님(집행부/사무국)" | null
  speechType: text("speech_type"), // "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal"; null if excluded
  hasQaStructure: boolean("has_qa_structure").notNull().default(false), // KPI3·4 N/A 판정 근거
  citations: jsonb("citations").$type<{ type: "L" | "S" | "P" | "F"; text: string }[]>(),
  kpiEvidenceDensity: numeric("kpi_evidence_density"), // KPI① 값, null if speechDurationSec unknown
  kpiEvidenceDensityGrade: text("kpi_evidence_density_grade"), // "A"|"B"|"C"|"D"|null
  proposals: jsonb("proposals").$type<{ budget: boolean; timeline: boolean; subject: boolean; method: boolean }[]>(),
  kpiSolutionSpecificity: numeric("kpi_solution_specificity"), // KPI② 값, null if 제안 0건
  qaRounds: jsonb("qa_rounds").$type<{ roundIndex: number; answerGrade: string; bonusTags: string[] }[]>(),
  kpiInterrogationDepth: numeric("kpi_interrogation_depth"), // KPI③ 값, null if no Q&A structure
  kpiReQuestionRate: numeric("kpi_re_question_rate"),
  kpiCommitmentRate: numeric("kpi_commitment_rate"), // KPI④ 값, null if no Q&A structure
  selfRaisedIssues: jsonb("self_raised_issues").$type<{ description: string }[]>(), // KPI⑤ 후보, matchIssues 입력
  topicsToWatch: jsonb("topics_to_watch").$type<string[]>(),
  rationale: text("rationale"),
  rubricVersion: text("rubric_version").notNull().default("v2.0-5kpi"),
  sonnetModel: text("sonnet_model").notNull(),
  opusModel: text("opus_model"), // null unless matchIssues was called this statement
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

// KPI⑤(이슈지속추적률)는 의원 누적 단위이므로 statementInsights와 별도로 관리한다.
export const issueTickets = pgTable("issue_tickets", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  description: text("description").notNull(),
  registeredStatementId: integer("registered_statement_id").notNull().references(() => statements.id),
  registeredMeetingId: integer("registered_meeting_id").notNull().references(() => meetings.id),
  status: text("status").notNull().default("open"), // "open" | "resolved"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const issueReviews = pgTable("issue_reviews", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => issueTickets.id),
  reviewedStatementId: integer("reviewed_statement_id").notNull().references(() => statements.id),
  reviewedMeetingId: integer("reviewed_meeting_id").notNull().references(() => meetings.id),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});
```

파일 최상단 import 목록(1행)에 `boolean`, `numeric` 추가:

```ts
import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, boolean, numeric } from "drizzle-orm/pg-core";
```

- [ ] **Step 3: 마이그레이션 생성**

Run: `cd backend && npx drizzle-kit generate`
Expected: `backend/drizzle/` 아래 새 SQL 마이그레이션 파일 생성(8축 컬럼 DROP + 신규 컬럼/테이블 ADD/CREATE)

- [ ] **Step 4: 마이그레이션 적용**

Run: `cd backend && npx drizzle-kit migrate`
Expected: 성공, 에러 없음

- [ ] **Step 5: Commit**

```bash
git add backend/db/schema.ts backend/drizzle/
git commit -m "feat(db): migrate statementInsights to 5-KPI columns, add issueTickets/issueReviews tables"
```

---

## Task 9: 파이프라인 재작성 — `processStatement.ts`

**Files:**
- Modify: `backend/lib/pipeline/processStatement.ts`
- Modify: `backend/lib/pipeline/processStatement.test.ts`

**Interfaces:**
- Consumes: `summarizeStatement`(Task 4), `hasQaStructure`/`extractQaRounds`(Task 5),
  `matchIssues`(Task 6), `computeEvidenceDensity`/`computeSolutionSpecificity`/
  `computeInterrogationDepth`/`computeCommitmentRate`(Task 7), `statementInsights`/`issueTickets`/
  `issueReviews`(Task 8).
- Produces: `processOneStatement(statementId)`가 새 스키마에 맞는 행을 insert. 발언시간
  (`speechDurationSec`)을 구할 소스가 현재 스크래퍼에 없으므로, 이 태스크에서는 `null`로 고정
  전달하고(→ KPI1이 항상 N/A로 나옴), TODO 주석으로 "스크래퍼가 발언시간을 캡처하면 여기를
  연결"이라고 명시한다(§Non-Goals — 스크래퍼 확장은 이 계획 범위 밖).

- [ ] **Step 1: 기존 테스트를 새 목(mock) 구조로 재작성**

`backend/lib/pipeline/processStatement.test.ts`의 `vi.mock` 블록(10~17행)을 교체:

```ts
vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));
vi.mock("@/lib/ai/summarize", () => ({ summarizeStatement: vi.fn() }));
vi.mock("@/lib/ai/extractQaRounds", () => ({ hasQaStructure: vi.fn(), extractQaRounds: vi.fn() }));
vi.mock("@/lib/ai/matchIssues", () => ({ matchIssues: vi.fn() }));

import { db } from "@/db/client";
import { summarizeStatement } from "@/lib/ai/summarize";
import { hasQaStructure, extractQaRounds } from "@/lib/ai/extractQaRounds";
import { matchIssues } from "@/lib/ai/matchIssues";
import { processOneStatement } from "./processStatement";
```

세 번째 테스트("scores a substantive statement...")를 아래로 교체:

```ts
test("computes KPIs for a substantive statement with no Q&A structure and no open tickets", async () => {
  (db.select as any)
    .mockReturnValueOnce(chainable([mockStatement])) // statements
    .mockReturnValueOnce(chainable([mockMember])) // members
    .mockReturnValueOnce(chainable([])) // following-speaker lookup (for hasQaStructure)
    .mockReturnValueOnce(chainable([])); // open issueTickets for this member
  const insertValues = vi.fn(() => Promise.resolve());
  (db.insert as any).mockReturnValue({ values: insertValues });
  (summarizeStatement as any).mockResolvedValue({
    summary: "실질 발언 요약",
    tags: ["예산"],
    isProcedural: false,
    speechType: "budget_review",
    citations: [{ type: "L", text: "지방재정법 제17조" }],
    proposals: [],
    selfRaisedIssues: [],
  });
  (hasQaStructure as any).mockReturnValue(false);

  const result = await processOneStatement(1);

  expect(result).toEqual({ statementId: 1, outcome: "processed" });
  expect(extractQaRounds).not.toHaveBeenCalled();
  expect(matchIssues).not.toHaveBeenCalled();
  expect(insertValues).toHaveBeenCalledWith(
    expect.objectContaining({
      hasQaStructure: false,
      kpiInterrogationDepth: null,
      kpiCommitmentRate: null,
      kpiEvidenceDensity: null, // speechDurationSec not available yet (see Task 9 Interfaces note)
    })
  );
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx vitest run lib/pipeline/processStatement.test.ts`
Expected: FAIL — `processStatement.ts`가 옛 `scoreStatement`/`AxisScores` import를 참조해
컴파일 에러, 또는 새 mock 함수가 호출되지 않아 assertion 실패

- [ ] **Step 3: `processStatement.ts` 재작성**

전체 파일을 아래로 교체:

```ts
import { db } from "@/db/client";
import { statements, statementInsights, members, meetings, agendaItems, issueTickets, issueReviews } from "@/db/schema";
import { and, count, eq, isNull, gt, asc } from "drizzle-orm";
import { summarizeStatement } from "@/lib/ai/summarize";
import { hasQaStructure, extractQaRounds } from "@/lib/ai/extractQaRounds";
import { matchIssues } from "@/lib/ai/matchIssues";
import {
  computeEvidenceDensity,
  computeSolutionSpecificity,
  computeInterrogationDepth,
  computeCommitmentRate,
} from "@/lib/scoring/kpi";
import { isNonMemberSpeaker } from "@/lib/members/isNonMemberSpeaker";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(5000 * 2 ** i);
    }
  }
  throw lastErr;
}

/**
 * 현재 statement 이후, 같은 회의 내 다음 "의원" statement가 나오기 전까지의 화자 이름들과
 * 답변 원문을 가져온다. hasQaStructure()가 이걸로 질의응답 구조 유무를 판정하고, 있으면
 * extractQaRounds()에 답변 원문들을 넘긴다.
 */
async function getFollowingTurnsUntilNextMember(
  meetingId: number,
  orderInMeeting: number
): Promise<{ speakerNames: string[]; answerTexts: string[] }> {
  const rows = await db
    .select({ name: members.name, rawText: statements.rawText })
    .from(statements)
    .innerJoin(members, eq(statements.memberId, members.id))
    .where(and(eq(statements.meetingId, meetingId), gt(statements.orderInMeeting, orderInMeeting)))
    .orderBy(asc(statements.orderInMeeting));

  const speakerNames: string[] = [];
  const answerTexts: string[] = [];
  for (const row of rows) {
    if (!isNonMemberSpeaker(row.name)) break; // next member turn — stop
    speakerNames.push(row.name);
    answerTexts.push(row.rawText);
  }
  return { speakerNames, answerTexts };
}

async function getOpenTickets(memberId: number): Promise<{ id: number; description: string }[]> {
  const rows = await db
    .select({ id: issueTickets.id, description: issueTickets.description })
    .from(issueTickets)
    .where(and(eq(issueTickets.memberId, memberId), eq(issueTickets.status, "open")));
  return rows;
}

export async function getPendingStatementIds(limit?: number): Promise<number[]> {
  const base = db
    .select({ id: statements.id })
    .from(statements)
    .leftJoin(statementInsights, eq(statementInsights.statementId, statements.id))
    .where(isNull(statementInsights.id));
  const rows = limit ? await base.limit(limit) : await base;
  return rows.map((s) => s.id);
}

export async function countPendingStatements(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(statements)
    .leftJoin(statementInsights, eq(statementInsights.statementId, statements.id))
    .where(isNull(statementInsights.id));
  return row?.value ?? 0;
}

export type ProcessOutcome = "processed" | "excluded" | "failed";
export interface ProcessResult {
  statementId: number;
  outcome: ProcessOutcome;
  reason?: string;
}

export async function processOneStatement(statementId: number): Promise<ProcessResult> {
  const [stmt] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!stmt) return { statementId, outcome: "failed", reason: "statement not found" };

  try {
    const [member] = await db.select().from(members).where(eq(members.id, stmt.memberId));
    const agendaTitle = stmt.agendaItemId
      ? (await db.select().from(agendaItems).where(eq(agendaItems.id, stmt.agendaItemId)))[0]?.title ?? null
      : null;

    if (isNonMemberSpeaker(member.name)) {
      await db.insert(statementInsights).values({
        statementId: stmt.id,
        summary: stmt.rawText.slice(0, 200),
        tags: [],
        excludedReason: "의원 아님(집행부/사무국)",
        sonnetModel: "n/a",
      });
      return { statementId, outcome: "excluded", reason: "의원 아님(집행부/사무국)" };
    }

    const { summary, tags, isProcedural, speechType, citations, proposals, selfRaisedIssues } = await withRetry(() =>
      summarizeStatement(stmt.rawText, agendaTitle)
    );

    if (isProcedural) {
      await db.insert(statementInsights).values({
        statementId: stmt.id,
        summary,
        tags,
        excludedReason: "의사진행 발언",
        sonnetModel: "claude-sonnet-5",
      });
      return { statementId, outcome: "excluded", reason: "의사진행 발언" };
    }

    const { speakerNames, answerTexts } = await getFollowingTurnsUntilNextMember(stmt.meetingId, stmt.orderInMeeting);
    const qaStructurePresent = hasQaStructure(speakerNames);
    const qaRounds = qaStructurePresent ? await withRetry(() => extractQaRounds(stmt.rawText, answerTexts)) : [];

    // TODO: speechDurationSec is not yet captured by the scraper (backend/scripts/scrape/minutes.ts) —
    // wire this up once that data is available. Until then, KPI1 (근거밀도) is always N/A.
    const speechDurationSec: number | null = null;
    const evidenceDensity = computeEvidenceDensity(citations, speechDurationSec);
    const solutionSpecificity = computeSolutionSpecificity(proposals);
    const interrogationDepth = computeInterrogationDepth(qaRounds);
    const commitmentRate = computeCommitmentRate(qaRounds);

    let opusModel: string | null = null;
    if (selfRaisedIssues.length > 0) {
      const openTickets = await getOpenTickets(stmt.memberId);
      if (openTickets.length > 0) {
        const matches = await withRetry(() => matchIssues(selfRaisedIssues.map((i) => i.description), openTickets));
        opusModel = "claude-opus-5";
        for (const match of matches) {
          if (match.matchedTicketId !== null) {
            await db.insert(issueReviews).values({
              ticketId: match.matchedTicketId,
              reviewedStatementId: stmt.id,
              reviewedMeetingId: stmt.meetingId,
            });
          } else {
            await db.insert(issueTickets).values({
              memberId: stmt.memberId,
              description: selfRaisedIssues[match.newIssueIndex].description,
              registeredStatementId: stmt.id,
              registeredMeetingId: stmt.meetingId,
            });
          }
        }
      } else {
        for (const issue of selfRaisedIssues) {
          await db.insert(issueTickets).values({
            memberId: stmt.memberId,
            description: issue.description,
            registeredStatementId: stmt.id,
            registeredMeetingId: stmt.meetingId,
          });
        }
      }
    }

    await db.insert(statementInsights).values({
      statementId: stmt.id,
      summary,
      tags,
      speechType,
      hasQaStructure: qaStructurePresent,
      citations,
      kpiEvidenceDensity: evidenceDensity.value === null ? null : String(evidenceDensity.value),
      kpiEvidenceDensityGrade: evidenceDensity.grade,
      proposals,
      kpiSolutionSpecificity: solutionSpecificity === null ? null : String(solutionSpecificity),
      qaRounds,
      kpiInterrogationDepth: interrogationDepth === null ? null : String(interrogationDepth.value),
      kpiReQuestionRate: interrogationDepth === null ? null : String(interrogationDepth.reQuestionRate),
      kpiCommitmentRate: commitmentRate === null ? null : String(commitmentRate),
      selfRaisedIssues,
      sonnetModel: "claude-sonnet-5",
      opusModel,
    });

    return { statementId, outcome: "processed" };
  } catch (err) {
    return { statementId, outcome: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx vitest run lib/pipeline/processStatement.test.ts`
Expected: PASS (4 tests — 기존 2개 exclude 테스트 + 새 KPI 테스트, 그리고 첫 번째 exclude 테스트는
`db.select`가 이제 statements/members만 필요하므로 그대로 통과)

- [ ] **Step 5: Commit**

```bash
git add backend/lib/pipeline/processStatement.ts backend/lib/pipeline/processStatement.test.ts
git commit -m "feat(pipeline): rewire processOneStatement for 5-KPI extraction + issue ticket matching"
```

---

## Task 10: 쿼리 레이어 — `insights.ts` + 이슈지속추적률 집계

**Files:**
- Modify: `backend/lib/queries/insights.ts`

**Interfaces:**
- Consumes: Task 8의 `statementInsights`/`issueTickets`/`issueReviews` 스키마.
- Produces:
  ```ts
  export interface InsightRow { statementId, meetingId, meetingTitle, memberName, tags, topicsToWatch, speechType, hasQaStructure, kpiEvidenceDensity, kpiEvidenceDensityGrade, kpiSolutionSpecificity, kpiInterrogationDepth, kpiReQuestionRate, kpiCommitmentRate, summary, rawText, rationale }
  export async function getInsightRows(): Promise<InsightRow[]>
  export interface MemberIssuePersistence { memberName, totalIssues, reviewedIssues, rate: number | null, grade: Grade | null, status: "scored" | "tracking" }
  export async function getMemberIssuePersistence(): Promise<MemberIssuePersistence[]>
  ```
  Task 11(API route)이 두 함수를 모두 호출한다.

- [ ] **Step 1: `InsightRow`와 `getInsightRows` 갱신**

`backend/lib/queries/insights.ts`의 `InsightRow` 인터페이스(12~33행)를 교체:

```ts
export interface InsightRow {
  statementId: number;
  meetingId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  hasQaStructure: boolean;
  citations: { type: "L" | "S" | "P" | "F"; text: string }[];
  kpiEvidenceDensity: number | null;
  kpiEvidenceDensityGrade: string | null;
  proposals: { budget: boolean; timeline: boolean; subject: boolean; method: boolean }[];
  kpiSolutionSpecificity: number | null;
  qaRounds: { roundIndex: number; answerGrade: string; bonusTags: string[] }[];
  kpiInterrogationDepth: number | null;
  kpiReQuestionRate: number | null;
  kpiCommitmentRate: number | null;
  selfRaisedIssues: { description: string }[];
  summary: string;
  rawText: string;
  rationale: string;
}
```

`getInsightRows()`의 `select`(43~64행) 컬럼 목록을 교체:

```ts
      .select({
        statementId: statements.id,
        meetingId: statements.meetingId,
        meetingTitle: meetings.title,
        memberName: members.name,
        tags: statementInsights.tags,
        topicsToWatch: statementInsights.topicsToWatch,
        speechType: statementInsights.speechType,
        hasQaStructure: statementInsights.hasQaStructure,
        citations: statementInsights.citations,
        kpiEvidenceDensity: statementInsights.kpiEvidenceDensity,
        kpiEvidenceDensityGrade: statementInsights.kpiEvidenceDensityGrade,
        proposals: statementInsights.proposals,
        kpiSolutionSpecificity: statementInsights.kpiSolutionSpecificity,
        qaRounds: statementInsights.qaRounds,
        kpiInterrogationDepth: statementInsights.kpiInterrogationDepth,
        kpiReQuestionRate: statementInsights.kpiReQuestionRate,
        kpiCommitmentRate: statementInsights.kpiCommitmentRate,
        selfRaisedIssues: statementInsights.selfRaisedIssues,
        summary: statementInsights.summary,
        rawText: statements.rawText,
        rationale: statementInsights.rationale,
      })
```

`normalized`(82~97행) 매핑을 교체:

```ts
  const normalized = rows.map((r) => ({
    ...r,
    memberName: normalizeMemberName(r.memberName),
    tags: r.tags ?? [],
    topicsToWatch: r.topicsToWatch ?? [],
    speechType: r.speechType!,
    citations: r.citations ?? [],
    kpiEvidenceDensity: r.kpiEvidenceDensity === null ? null : Number(r.kpiEvidenceDensity),
    proposals: r.proposals ?? [],
    kpiSolutionSpecificity: r.kpiSolutionSpecificity === null ? null : Number(r.kpiSolutionSpecificity),
    qaRounds: r.qaRounds ?? [],
    kpiInterrogationDepth: r.kpiInterrogationDepth === null ? null : Number(r.kpiInterrogationDepth),
    kpiReQuestionRate: r.kpiReQuestionRate === null ? null : Number(r.kpiReQuestionRate),
    kpiCommitmentRate: r.kpiCommitmentRate === null ? null : Number(r.kpiCommitmentRate),
    selfRaisedIssues: r.selfRaisedIssues ?? [],
    rationale: r.rationale ?? "",
  }));
```

`membersByMeetingId`/`qualifyingMeetingIds` 게이팅 로직(99~113행)은 그대로 둔다(3명 미만 회의
제외, 부의 안건 게이트 — KPI 체계 변경과 무관한 로직).

- [ ] **Step 2: `getMemberIssuePersistence` 추가**

같은 파일 끝에 추가:

```ts
import { issueTickets, issueReviews } from "@/db/schema";
import { sql } from "drizzle-orm";
import { computeIssuePersistenceGrade, type Grade } from "@/lib/scoring/kpi";

const MIN_SESSIONS_FOR_RATE = 3;

export interface MemberIssuePersistence {
  memberName: string;
  totalIssues: number;
  reviewedIssues: number;
  rate: number | null;
  grade: Grade | null;
  status: "scored" | "tracking";
}

/**
 * KPI⑤는 의원 누적 단위 — statementInsights가 아니라 issueTickets/issueReviews를 집계한다.
 * 이력이 MIN_SESSIONS_FOR_RATE회기 미만인 의원은 비율 대신 "tracking"으로 표시한다
 * (docs/rubric/CLAUDE.md §3⑤ "추적 중").
 */
export async function getMemberIssuePersistence(): Promise<MemberIssuePersistence[]> {
  const ticketRows = await db
    .select({
      memberName: members.name,
      ticketId: issueTickets.id,
      registeredMeetingId: issueTickets.registeredMeetingId,
    })
    .from(issueTickets)
    .innerJoin(members, eq(issueTickets.memberId, members.id));

  const reviewedTicketIds = new Set(
    (await db.select({ ticketId: issueReviews.ticketId }).from(issueReviews)).map((r) => r.ticketId)
  );

  const byMember = new Map<string, { total: number; reviewed: number; meetingIds: Set<number> }>();
  for (const row of ticketRows) {
    const name = normalizeMemberName(row.memberName);
    const entry = byMember.get(name) ?? { total: 0, reviewed: 0, meetingIds: new Set<number>() };
    entry.total += 1;
    if (reviewedTicketIds.has(row.ticketId)) entry.reviewed += 1;
    entry.meetingIds.add(row.registeredMeetingId);
    byMember.set(name, entry);
  }

  return [...byMember.entries()].map(([memberName, entry]) => {
    if (entry.meetingIds.size < MIN_SESSIONS_FOR_RATE) {
      return { memberName, totalIssues: entry.total, reviewedIssues: entry.reviewed, rate: null, grade: null, status: "tracking" as const };
    }
    const rate = Math.round((entry.reviewed / entry.total) * 100) / 100;
    return { memberName, totalIssues: entry.total, reviewedIssues: entry.reviewed, rate, grade: computeIssuePersistenceGrade(rate), status: "scored" as const };
  });
}
```

- [ ] **Step 3: 확인**

Run: `cd backend && npx tsc --noEmit`
Expected: 타입 에러 없음 (기존 테스트가 없는 파일이므로 여기서는 typecheck로 검증)

- [ ] **Step 4: Commit**

```bash
git add backend/lib/queries/insights.ts
git commit -m "feat(queries): return 5-KPI fields from getInsightRows, add getMemberIssuePersistence"
```

---

## Task 11: API 라우트 갱신

**Files:**
- Modify: `backend/app/api/insights/route.ts`
- Create: `backend/app/api/issue-persistence/route.ts`
- Modify: `backend/app/api/insights/route.test.ts` (있는 필터 관련 테스트가 있다면 갱신)

**Interfaces:**
- Consumes: `getInsightRows`/`getMemberIssuePersistence`(Task 10).
- Produces: `GET /api/insights?member=&meeting=&minKpi=evidenceDensity|solutionSpecificity|interrogationDepth|commitmentRate&minValue=` /
  `GET /api/issue-persistence` (신규 엔드포인트, `MemberIssuePersistence[]` 반환).

- [ ] **Step 1: `route.ts` 필터 로직 갱신**

전체 파일 교체:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getInsightRows, type InsightRow } from "@/lib/queries/insights";

const KPI_FIELD_MAP = {
  evidenceDensity: "kpiEvidenceDensity",
  solutionSpecificity: "kpiSolutionSpecificity",
  interrogationDepth: "kpiInterrogationDepth",
  commitmentRate: "kpiCommitmentRate",
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const member = searchParams.get("member");
  const meeting = searchParams.get("meeting");
  const minKpi = searchParams.get("minKpi") as keyof typeof KPI_FIELD_MAP | null;
  const minValue = searchParams.get("minValue") ? Number(searchParams.get("minValue")) : null;

  const rows = await getInsightRows();
  const filtered = rows.filter((r) => {
    if (member && r.memberName !== member) return false;
    if (meeting && r.meetingTitle !== meeting) return false;
    if (minKpi && minValue !== null) {
      const field = KPI_FIELD_MAP[minKpi];
      const value = (r as unknown as Record<string, number | null>)[field];
      if (value === null || value < minValue) return false;
    }
    return true;
  });

  return NextResponse.json(filtered, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
```

- [ ] **Step 2: 신규 이슈지속추적률 엔드포인트**

`backend/app/api/issue-persistence/route.ts` 생성:

```ts
import { NextResponse } from "next/server";
import { getMemberIssuePersistence } from "@/lib/queries/insights";

export async function GET() {
  const rows = await getMemberIssuePersistence();
  return NextResponse.json(rows, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
```

- [ ] **Step 3: 기존 라우트 테스트 확인·갱신**

`backend/app/api/insights/route.test.ts`를 읽고, `minWeightedScore` 관련 케이스가 있다면
`minKpi`/`minValue` 조합으로 교체한다(파일이 없다면 이 단계는 스킵).

- [ ] **Step 4: 확인**

Run: `cd backend && npx vitest run app/api/insights/route.test.ts` (파일이 있다면)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/insights/route.ts backend/app/api/issue-persistence/route.ts backend/app/api/insights/route.test.ts
git commit -m "feat(api): expose 5-KPI filters on /api/insights, add /api/issue-persistence"
```

---

## Task 12: 모바일 — `axes.ts` → `kpis.ts`

**Files:**
- Create: `mobile/src/lib/kpis.ts`
- Delete: `mobile/src/lib/axes.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  ```ts
  export type Kpi = "evidenceDensity" | "solutionSpecificity" | "interrogationDepth" | "commitmentRate";
  export const KPIS: Kpi[]
  export const KPI_LABELS: Record<Kpi, string>
  export function kpiCellLabel(row: InsightRow, kpi: Kpi): string  // "―" for N/A
  export function meetingShortTitle(fullTitle: string): string  // unchanged, copied verbatim
  export function meetingSessionTitle(fullTitle: string): string  // unchanged, copied verbatim
  ```
  Task 13~16(모바일 컴포넌트)이 전부 이 모듈에서 import한다.

- [ ] **Step 1: `kpis.ts` 작성**

`mobile/src/lib/kpis.ts` 생성:

```ts
// mobile/src/lib/kpis.ts
//
// docs/rubric/CLAUDE.md §3의 5-KPI 표시용 상수. mobile은 backend 코드를 import하지 않으므로
// (CLAUDE.md 제약) 여기서 라벨만 직접 유지한다 — KPI 산식/등급 경계값 자체는 backend
// (backend/lib/scoring/kpi.ts)가 단일 진실 소스다.

import type { InsightRow } from "./api";

export type Kpi = "evidenceDensity" | "solutionSpecificity" | "interrogationDepth" | "commitmentRate";

export const KPIS: Kpi[] = ["evidenceDensity", "solutionSpecificity", "interrogationDepth", "commitmentRate"];

export const KPI_LABELS: Record<Kpi, string> = {
  evidenceDensity: "근거밀도",
  solutionSpecificity: "대안구체성",
  interrogationDepth: "추궁심도",
  commitmentRate: "답변확보율",
};

const KPI_FIELD: Record<Kpi, keyof InsightRow> = {
  evidenceDensity: "kpiEvidenceDensity",
  solutionSpecificity: "kpiSolutionSpecificity",
  interrogationDepth: "kpiInterrogationDepth",
  commitmentRate: "kpiCommitmentRate",
};

/** N/A(null)와 실제 값을 하나의 셀 표시 문자열로 통일한다. */
export function kpiCellLabel(row: InsightRow, kpi: Kpi): string {
  const value = row[KPI_FIELD[kpi]] as number | null;
  if (value === null) return "―";
  if (kpi === "commitmentRate") return `${Math.round(value * 100)}%`;
  if (kpi === "evidenceDensity") return `${value.toFixed(2)}${row.kpiEvidenceDensityGrade ? `(${row.kpiEvidenceDensityGrade})` : ""}`;
  return value.toFixed(2);
}

/** backend/app/table1/Table1Client.tsx의 meetingShortTitle()과 동일한 규칙 — 변경 없음. */
export function meetingShortTitle(fullTitle: string): string {
  return fullTitle.split("\n")[0].trim();
}

/** 변경 없음 — mobile/src/lib/axes.ts에서 그대로 이동. */
export function meetingSessionTitle(fullTitle: string): string {
  const firstLine = meetingShortTitle(fullTitle);
  const match = firstLine.match(/^거제시의회\s*제10대\s*(.+?)\s*회의록\s*$/);
  return match ? match[1].trim() : firstLine;
}
```

- [ ] **Step 2: 확인**

Run: `cd mobile && npx tsc --noEmit`
Expected: `axes.ts`를 import하는 다른 파일들이 아직 갱신 전이라 에러가 남아있는 것이 정상(Task 13~16에서
해소). 여기서는 `kpis.ts` 자체에 구문 에러가 없는지만 확인한다.

- [ ] **Step 3: Commit**

```bash
git rm mobile/src/lib/axes.ts
git add mobile/src/lib/kpis.ts
git commit -m "feat(mobile): replace 8-axis display constants with 5-KPI equivalents"
```

---

## Task 13: 모바일 — `api.ts` 타입·필터 갱신

**Files:**
- Modify: `mobile/src/lib/api.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `InsightRow`(5-KPI 필드), `InsightFilters`(`minKpi`/`minValue`), `groupByMemberMeeting`/
  `groupByMember`가 `weightedScore` 대신 `kpiEvidenceDensity`(또는 선택된 KPI)로 대표 발언을
  고르도록 매개변수화. Task 14~16이 이 타입·함수를 소비한다.

- [ ] **Step 1: `InsightRow`/`InsightFilters` 교체**

`mobile/src/lib/api.ts`의 4~30행을 교체:

```ts
export interface InsightRow {
  statementId: number;
  meetingId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  hasQaStructure: boolean;
  citations: { type: "L" | "S" | "P" | "F"; text: string }[];
  kpiEvidenceDensity: number | null;
  kpiEvidenceDensityGrade: string | null;
  proposals: { budget: boolean; timeline: boolean; subject: boolean; method: boolean }[];
  kpiSolutionSpecificity: number | null;
  qaRounds: { roundIndex: number; answerGrade: string; bonusTags: string[] }[];
  kpiInterrogationDepth: number | null;
  kpiReQuestionRate: number | null;
  kpiCommitmentRate: number | null;
  selfRaisedIssues: { description: string }[];
  summary: string;
  rawText: string;
  rationale: string;
}

export interface InsightFilters {
  member?: string;
  meeting?: string;
  minKpi?: "evidenceDensity" | "solutionSpecificity" | "interrogationDepth" | "commitmentRate";
  minValue?: number;
}
```

`fetchInsights`(32~47행)의 쿼리스트링 구성부를 교체:

```ts
export async function fetchInsights(filters: InsightFilters = {}): Promise<InsightRow[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.meeting) params.set("meeting", filters.meeting);
  if (filters.minKpi) params.set("minKpi", filters.minKpi);
  if (filters.minValue !== undefined) params.set("minValue", String(filters.minValue));

  const res = await fetch(`${base}/api/insights?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`);
  const rows: InsightRow[] = await res.json();

  return rows.filter((r) => MEMBER_ROSTER.has(r.memberName));
}
```

- [ ] **Step 2: 그룹핑 함수를 KPI 매개변수화**

`groupByMemberMeeting`(67~80행)을 정렬 기준을 인자로 받도록 교체:

```ts
import { KPI_LABELS, type Kpi } from "./kpis";

const KPI_FIELD: Record<Kpi, keyof InsightRow> = {
  evidenceDensity: "kpiEvidenceDensity",
  solutionSpecificity: "kpiSolutionSpecificity",
  interrogationDepth: "kpiInterrogationDepth",
  commitmentRate: "kpiCommitmentRate",
};

function kpiValue(row: InsightRow, kpi: Kpi): number {
  return (row[KPI_FIELD[kpi]] as number | null) ?? -Infinity; // N/A sorts last on desc
}

/**
 * 한 의원이 한 회의에서 여러 건의 유효 발언을 했을 때 표1에는 회의당 의원 1행만 노출하기 위한
 * 그룹화. 대표 발언은 주어진 kpi 기준 최댓값(N/A는 최하위로 취급)을 가진 발언으로 정한다.
 */
export function groupByMemberMeeting(rows: InsightRow[], kpi: Kpi = "evidenceDensity"): InsightGroup[] {
  const byKey = new Map<string, InsightRow[]>();
  for (const row of rows) {
    const key = `${row.meetingTitle}::${row.memberName}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  return [...byKey.values()].map((group) => {
    const sorted = [...group].sort((a, b) => kpiValue(b, kpi) - kpiValue(a, kpi));
    return { representative: sorted[0], siblings: sorted.slice(1) };
  });
}
```

`groupByMember`(92~113행)도 동일한 패턴으로 `kpi` 매개변수를 받아 `kpiValue`로 대표/평균을
계산하도록 교체(단, `averageScore` 필드는 삭제 — KPI별로 별도 평균을 UI 쪽에서 계산하도록
`InsightMemberGroup`에서 `averageScore: number`를 `kpiAverages: Partial<Record<Kpi, number>>`로
바꾼다):

```ts
export interface InsightMemberGroup {
  memberName: string;
  representative: InsightRow;
  kpiAverages: Partial<Record<Kpi, number>>;
  meetingCount: number;
}

export function groupByMember(rows: InsightRow[], primaryKpi: Kpi = "evidenceDensity"): InsightMemberGroup[] {
  const byMember = new Map<string, InsightGroup[]>();
  for (const group of groupByMemberMeeting(rows, primaryKpi)) {
    const list = byMember.get(group.representative.memberName) ?? [];
    list.push(group);
    byMember.set(group.representative.memberName, list);
  }

  return [...byMember.entries()].map(([memberName, groups]) => {
    const representative = groups.reduce((best, g) =>
      kpiValue(g.representative, primaryKpi) > kpiValue(best.representative, primaryKpi) ? g : best
    ).representative;

    const kpiAverages: Partial<Record<Kpi, number>> = {};
    for (const kpi of Object.keys(KPI_FIELD) as Kpi[]) {
      const values = groups.map((g) => g.representative[KPI_FIELD[kpi]] as number | null).filter((v): v is number => v !== null);
      if (values.length > 0) kpiAverages[kpi] = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
    }

    return { memberName, representative, kpiAverages, meetingCount: groups.length };
  });
}
```

`fetchInsightWithSiblings`(119~131행)의 정렬 기준(`weightedScore`)도 `kpiEvidenceDensity`
기준으로 교체(표2는 항상 근거밀도 기준 정렬 — 상세화면에서는 어차피 모든 KPI를 다 보여주므로
정렬 기준 선택 UI는 불필요):

```ts
  const siblings = rows
    .filter((r) => r.statementId !== id && r.meetingTitle === row.meetingTitle && r.memberName === row.memberName)
    .sort((a, b) => (b.kpiEvidenceDensity ?? -Infinity) - (a.kpiEvidenceDensity ?? -Infinity));
```

- [ ] **Step 3: 확인**

Run: `cd mobile && npx tsc --noEmit`
Expected: `api.ts` 자체는 에러 없음. 이 파일을 쓰는 컴포넌트들은 Task 14~16에서 갱신 전까지
에러가 남아있는 것이 정상.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/api.ts
git commit -m "feat(mobile): parameterize InsightRow grouping by selectable KPI"
```

---

## Task 14: 모바일 — `OverviewTab.tsx` KPI 선택 정렬

**Files:**
- Modify: `mobile/src/components/table1/OverviewTab.tsx`

**Interfaces:**
- Consumes: `groupByMemberMeeting(rows, kpi)`(Task 13), `KPIS`/`KPI_LABELS`/`kpiCellLabel`/
  `meetingSessionTitle`(Task 12).
- Produces: 없음(리프 컴포넌트).

- [ ] **Step 1: import 및 정렬 타입 교체**

`mobile/src/components/table1/OverviewTab.tsx`의 1~18행을 교체:

```tsx
// mobile/src/components/table1/OverviewTab.tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightGroup, type InsightRow } from "@/lib/api";
import { KPIS, KPI_LABELS, kpiCellLabel, meetingSessionTitle, type Kpi } from "@/lib/kpis";
import { colors, typography, spacing } from "@/theme/tokens";

type SortField = "member" | "meeting" | "tags" | Kpi;
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  meeting: "회의",
  tags: "태그",
  ...KPI_LABELS,
};
```

- [ ] **Step 2: `compareGroups`와 KPI 선택 드롭다운 추가**

`compareGroups`(20~34행)를 교체:

```tsx
function isKpiField(field: SortField): field is Kpi {
  return (KPIS as string[]).includes(field);
}

function compareGroups(a: InsightGroup, b: InsightGroup, field: SortField): number {
  if (isKpiField(field)) {
    const av = kpiCellLabel(a.representative, field);
    const bv = kpiCellLabel(b.representative, field);
    // N/A("―")는 항상 최하위로 취급 — 숫자 비교 전에 걸러낸다.
    if (av === "―" && bv === "―") return 0;
    if (av === "―") return -1;
    if (bv === "―") return 1;
    return parseFloat(av) - parseFloat(bv);
  }
  if (field === "member") {
    return a.representative.memberName.localeCompare(b.representative.memberName, "ko");
  }
  if (field === "meeting") {
    return meetingSessionTitle(a.representative.meetingTitle).localeCompare(
      meetingSessionTitle(b.representative.meetingTitle),
      "ko"
    );
  }
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}
```

`OverviewTab` 본문(40~76행)에서 초기 정렬 기준과 컬럼 렌더를 KPI 선택형으로 교체:

```tsx
export function OverviewTab({ rows }: { rows: InsightRow[] }) {
  const [activeKpi, setActiveKpi] = useState<Kpi>("evidenceDensity");
  const [sort, setSort] = useState<SortState>({ field: "evidenceDensity", direction: "desc" });

  const groups = useMemo(() => {
    const base = groupByMemberMeeting(rows, activeKpi);
    const sorted = [...base].sort((a, b) => compareGroups(a, b, sort.field));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort, activeKpi]);

  function handleHeaderPress(field: SortField) {
    if (isKpiField(field)) setActiveKpi(field);
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "member" || field === "tags" ? "asc" : "desc" }
    );
  }

  function headerLabel(field: SortField) {
    if (sort.field !== field) return HEADER_LABELS[field];
    return `${HEADER_LABELS[field]} ${sort.direction === "asc" ? "▲" : "▼"}`;
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={[styles.cell, styles.memberCell]} onPress={() => handleHeaderPress("member")}>
        <Text style={styles.headerLabel}>{headerLabel("member")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.meetingCell]} onPress={() => handleHeaderPress("meeting")}>
        <Text style={styles.headerLabel}>{headerLabel("meeting")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.tagsCell]} onPress={() => handleHeaderPress("tags")}>
        <Text style={styles.headerLabel}>{headerLabel("tags")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress(activeKpi)}>
        <Text style={styles.headerLabel}>{headerLabel(activeKpi)}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.kpiSelectorRow}>
        {KPIS.map((kpi) => (
          <Pressable
            key={kpi}
            style={[styles.kpiChip, activeKpi === kpi && styles.kpiChipActive]}
            onPress={() => handleHeaderPress(kpi)}
          >
            <Text style={[styles.kpiChipLabel, activeKpi === kpi && styles.kpiChipLabelActive]}>{KPI_LABELS[kpi]}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={groups}
        keyExtractor={(group) => String(group.representative.statementId)}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        renderItem={({ item }) => {
          const row = item.representative;
          return (
            <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${row.statementId}`)}>
              <View style={[styles.cell, styles.memberCell]}>
                <Text style={styles.memberLabel}>{row.memberName}</Text>
              </View>
              <View style={[styles.cell, styles.meetingCell]}>
                <Text style={styles.meetingLabel} numberOfLines={1}>
                  {meetingSessionTitle(row.meetingTitle)}
                </Text>
              </View>
              <View style={[styles.cell, styles.tagsCell]}>
                <Text style={styles.tagsLabel} numberOfLines={1}>
                  {row.tags.join(", ")}
                </Text>
              </View>
              <View style={[styles.cell, styles.scoreCell]}>
                <Text style={styles.scoreLabel}>{kpiCellLabel(row, activeKpi)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
```

- [ ] **Step 3: 스타일에 KPI 선택 칩 스타일 추가**

`styles`(114~143행) 정의에 아래 항목 추가(기존 `container` 스타일은 `list`로 이름 변경하고,
바깥 `View`용 `container`를 새로 정의):

```tsx
const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  content: { padding: spacing[12] },
  kpiSelectorRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8], padding: spacing[12] },
  kpiChip: {
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.fill.normal,
  },
  kpiChipActive: { backgroundColor: colors.primary.normal },
  kpiChipLabel: { ...typography.label2, color: colors.label.neutral },
  kpiChipLabelActive: { color: colors.background.normal },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.background.alternative,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  cell: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
  },
  memberCell: { width: 68 },
  meetingCell: { width: 84 },
  tagsCell: { flex: 1 },
  scoreCell: { width: 88, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingLabel: { ...typography.caption1, color: colors.label.neutral },
  tagsLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
});
```

이에 맞춰 파일 상단 import에 `radius` 추가: `import { colors, typography, spacing, radius } from "@/theme/tokens";`

- [ ] **Step 4: 확인**

Run: `cd mobile && npx tsc --noEmit -- --project .` (또는 저장소에 설정된 typecheck 스크립트)
Expected: `OverviewTab.tsx` 관련 타입 에러 없음

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/table1/OverviewTab.tsx
git commit -m "feat(mobile): switch OverviewTab from single weighted score to selectable KPI sort"
```

---

## Task 15: 모바일 — `ScoreGridTab.tsx` KPI 컬럼

**Files:**
- Modify: `mobile/src/components/table1/ScoreGridTab.tsx`

**Interfaces:**
- Consumes: `KPIS`/`KPI_LABELS`/`kpiCellLabel`/`meetingSessionTitle`(Task 12),
  `groupByMemberMeeting`(Task 13).
- Produces: 없음(리프 컴포넌트).

- [ ] **Step 1: 8축 그리드를 4-KPI 그리드로 교체**

`mobile/src/components/table1/ScoreGridTab.tsx` 전체를 아래로 교체(가중치 범위 라벨
`weightRangeLabel`은 가중치표가 폐지되었으므로 제거하고, 헤더에는 KPI 라벨만 표시):

```tsx
// mobile/src/components/table1/ScoreGridTab.tsx
import { useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightRow } from "@/lib/api";
import { KPIS, KPI_LABELS, kpiCellLabel, meetingSessionTitle } from "@/lib/kpis";
import { colors, typography, spacing } from "@/theme/tokens";

const ROW_HEIGHT = 44;
const HEADER_ROW_HEIGHT = 44;
const SCORE_COLUMN_WIDTH = 84;

export function ScoreGridTab({ rows }: { rows: InsightRow[] }) {
  const groups = groupByMemberMeeting(rows, "evidenceDensity").sort(
    (a, b) => (b.representative.kpiEvidenceDensity ?? -Infinity) - (a.representative.kpiEvidenceDensity ?? -Infinity)
  );

  const headerGridScrollRef = useRef<ScrollView>(null);

  function handleBodyGridScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    headerGridScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.stickyColumn}>
          <View style={styles.dataRow}>
            <View style={[styles.cell, styles.headerCell, styles.memberCell]}>
              <Text style={styles.headerLabel}>의원</Text>
            </View>
            <View style={[styles.cell, styles.headerCell, styles.meetingCell]}>
              <Text style={styles.headerLabel}>회의</Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          ref={headerGridScrollRef}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={styles.grid}
        >
          <View style={styles.dataRow}>
            {KPIS.map((kpi) => (
              <View key={kpi} style={[styles.cell, styles.scoreCell, styles.headerCell]}>
                <Text style={styles.headerLabel}>{KPI_LABELS[kpi]}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.tableRow}>
          <View style={styles.stickyColumn}>
            {groups.map((group) => (
              <Pressable
                key={group.representative.statementId}
                style={styles.dataRow}
                onPress={() => router.push(`/statement/${group.representative.statementId}`)}
              >
                <View style={[styles.cell, styles.memberCell]}>
                  <Text style={styles.memberLabel}>{group.representative.memberName}</Text>
                </View>
                <View style={[styles.cell, styles.meetingCell]}>
                  <Text style={styles.meetingLabel} numberOfLines={1}>
                    {meetingSessionTitle(group.representative.meetingTitle)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            onScroll={handleBodyGridScroll}
            scrollEventThrottle={16}
            style={styles.grid}
          >
            <View>
              {groups.map((group) => (
                <View key={group.representative.statementId} style={styles.dataRow}>
                  {KPIS.map((kpi) => (
                    <View key={kpi} style={[styles.cell, styles.scoreCell]}>
                      <Text style={styles.scoreLabel}>{kpiCellLabel(group.representative, kpi)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    paddingHorizontal: spacing[12],
    paddingTop: spacing[12],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  container: { flex: 1 },
  contentContainer: { padding: spacing[12] },
  tableRow: { flexDirection: "row" },
  stickyColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.line.solid,
  },
  grid: { flexGrow: 0 },
  dataRow: { flexDirection: "row" },
  cell: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
    paddingHorizontal: spacing[6],
  },
  headerCell: { backgroundColor: colors.background.alternative, height: HEADER_ROW_HEIGHT },
  memberCell: { width: 88, alignItems: "flex-start" },
  meetingCell: { width: 132, alignItems: "flex-start" },
  scoreCell: { width: SCORE_COLUMN_WIDTH },
  headerLabel: { ...typography.label2, color: colors.label.alternative, textAlign: "center" },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingLabel: { ...typography.caption1, color: colors.label.neutral },
  scoreLabel: { ...typography.body2, color: colors.label.normal },
});
```

`footnote` prop과 `weightFootnote` 호출부가 있던 상위 컴포넌트(`mobile/src/app/index.tsx`)에서
`<ScoreGridTab rows={...} footnote={...} />` 호출을 `<ScoreGridTab rows={...} />`로 변경해야
한다 — Task 17에서 함께 처리한다.

- [ ] **Step 2: 확인**

Run: `cd mobile && npx tsc --noEmit`
Expected: `ScoreGridTab.tsx` 자체는 에러 없음(호출부 `index.tsx`는 Task 17까지 에러 남는 것이 정상)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/table1/ScoreGridTab.tsx
git commit -m "feat(mobile): replace 8-axis score grid with 4-KPI grid"
```

---

## Task 16: 모바일 — `AllMembersRankingTab.tsx` KPI 선택 + 이슈지속추적률 섹션

**Files:**
- Modify: `mobile/src/components/table1/AllMembersRankingTab.tsx`

**Interfaces:**
- Consumes: `groupByMember(rows, kpi)`(Task 13), `KPIS`/`KPI_LABELS`/`KPI_FIELD`류(Task 12),
  `GET /api/issue-persistence`(Task 11) — 신규 fetch 함수 필요.
- Produces: 없음(리프 컴포넌트).

- [ ] **Step 1: `mobile/src/lib/api.ts`에 이슈지속추적률 fetch 함수 추가**

`mobile/src/lib/api.ts` 끝에 추가:

```ts
export interface MemberIssuePersistence {
  memberName: string;
  totalIssues: number;
  reviewedIssues: number;
  rate: number | null;
  grade: string | null;
  status: "scored" | "tracking";
}

export async function fetchIssuePersistence(): Promise<MemberIssuePersistence[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const res = await fetch(`${base}/api/issue-persistence`);
  if (!res.ok) throw new Error(`Failed to fetch issue persistence: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: `AllMembersRankingTab.tsx`를 KPI 선택형 + 이슈지속추적률 열로 교체**

전체 파일 교체:

```tsx
// mobile/src/components/table1/AllMembersRankingTab.tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import {
  groupByMember,
  fetchIssuePersistence,
  type InsightMemberGroup,
  type InsightRow,
  type MemberIssuePersistence,
} from "@/lib/api";
import { KPIS, KPI_LABELS, type Kpi } from "@/lib/kpis";
import { colors, typography, spacing, radius } from "@/theme/tokens";

type SortField = "member" | "meetingCount" | "tags" | Kpi;
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  meetingCount: "참여회의수",
  tags: "태그",
  ...KPI_LABELS,
};

function isKpiField(field: SortField): field is Kpi {
  return (KPIS as string[]).includes(field);
}

function compareGroups(a: InsightMemberGroup, b: InsightMemberGroup, field: SortField): number {
  if (isKpiField(field)) {
    return (a.kpiAverages[field] ?? -Infinity) - (b.kpiAverages[field] ?? -Infinity);
  }
  if (field === "meetingCount") return a.meetingCount - b.meetingCount;
  if (field === "member") return a.memberName.localeCompare(b.memberName, "ko");
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}

export function AllMembersRankingTab({ rows }: { rows: InsightRow[] }) {
  const [activeKpi, setActiveKpi] = useState<Kpi>("evidenceDensity");
  const [sort, setSort] = useState<SortState>({ field: "evidenceDensity", direction: "desc" });
  const [issuePersistence, setIssuePersistence] = useState<Map<string, MemberIssuePersistence>>(new Map());

  useEffect(() => {
    fetchIssuePersistence().then((list) => setIssuePersistence(new Map(list.map((p) => [p.memberName, p]))));
  }, []);

  const groups = useMemo(() => {
    const base = groupByMember(rows, activeKpi);
    const sorted = [...base].sort((a, b) => compareGroups(a, b, sort.field));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort, activeKpi]);

  function handleHeaderPress(field: SortField) {
    if (isKpiField(field)) setActiveKpi(field);
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "member" || field === "tags" ? "asc" : "desc" }
    );
  }

  function headerLabel(field: SortField) {
    if (sort.field !== field) return HEADER_LABELS[field];
    return `${HEADER_LABELS[field]} ${sort.direction === "asc" ? "▲" : "▼"}`;
  }

  function issuePersistenceLabel(memberName: string): string {
    const p = issuePersistence.get(memberName);
    if (!p) return "―";
    if (p.status === "tracking") return "추적 중";
    return `${Math.round((p.rate ?? 0) * 100)}%(${p.grade})`;
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={[styles.cell, styles.memberCell]} onPress={() => handleHeaderPress("member")}>
        <Text style={styles.headerLabel}>{headerLabel("member")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.meetingCountCell]} onPress={() => handleHeaderPress("meetingCount")}>
        <Text style={styles.headerLabel}>{headerLabel("meetingCount")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress(activeKpi)}>
        <Text style={styles.headerLabel}>{headerLabel(activeKpi)}</Text>
      </Pressable>
      <View style={[styles.cell, styles.issueCell]}>
        <Text style={styles.headerLabel}>이슈지속추적률</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.kpiSelectorRow}>
        {KPIS.map((kpi) => (
          <Pressable
            key={kpi}
            style={[styles.kpiChip, activeKpi === kpi && styles.kpiChipActive]}
            onPress={() => handleHeaderPress(kpi)}
          >
            <Text style={[styles.kpiChipLabel, activeKpi === kpi && styles.kpiChipLabelActive]}>{KPI_LABELS[kpi]}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={groups}
        keyExtractor={(group) => group.memberName}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        renderItem={({ item }) => {
          const row = item.representative;
          return (
            <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${row.statementId}`)}>
              <View style={[styles.cell, styles.memberCell]}>
                <Text style={styles.memberLabel}>{item.memberName}</Text>
              </View>
              <View style={[styles.cell, styles.meetingCountCell]}>
                <Text style={styles.meetingCountLabel}>{item.meetingCount}회</Text>
              </View>
              <View style={[styles.cell, styles.scoreCell]}>
                <Text style={styles.scoreLabel}>{item.kpiAverages[activeKpi]?.toFixed(2) ?? "―"}</Text>
              </View>
              <View style={[styles.cell, styles.issueCell]}>
                <Text style={styles.issueLabel}>{issuePersistenceLabel(item.memberName)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  content: { padding: spacing[12] },
  kpiSelectorRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8], padding: spacing[12] },
  kpiChip: { paddingHorizontal: spacing[10], paddingVertical: spacing[6], borderRadius: radius.full, backgroundColor: colors.fill.normal },
  kpiChipActive: { backgroundColor: colors.primary.normal },
  kpiChipLabel: { ...typography.label2, color: colors.label.neutral },
  kpiChipLabelActive: { color: colors.background.normal },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.background.alternative,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  cell: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
  },
  memberCell: { width: 68 },
  meetingCountCell: { width: 76, alignItems: "flex-end" },
  scoreCell: { width: 88, alignItems: "flex-end" },
  issueCell: { width: 96, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingCountLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
  issueLabel: { ...typography.body2, color: colors.label.neutral },
});
```

- [ ] **Step 3: 확인**

Run: `cd mobile && npx tsc --noEmit`
Expected: `AllMembersRankingTab.tsx`, `api.ts` 관련 에러 없음

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/api.ts mobile/src/components/table1/AllMembersRankingTab.tsx
git commit -m "feat(mobile): add KPI selector + issue persistence column to AllMembersRankingTab"
```

---

## Task 17: 모바일 — `index.tsx` 탭 컨테이너 호출부 갱신

**Files:**
- Modify: `mobile/src/app/index.tsx`

**Interfaces:**
- Consumes: `OverviewTab`(Task 14), `ScoreGridTab`(Task 15, `footnote` prop 제거됨),
  `AllMembersRankingTab`(Task 16).
- Produces: 없음(최상위 화면).

- [ ] **Step 1: `ScoreGridTab` 호출부에서 `footnote` prop과 `weightFootnote` 호출 제거**

`mobile/src/app/index.tsx`를 읽고, `weightFootnote`(옛 `@/lib/axes` export, Task 12에서
`kpis.ts`로 대체되며 삭제됨) import와 `<ScoreGridTab rows={...} footnote={weightFootnote(...)} />`
호출부를 찾아 `<ScoreGridTab rows={...} />`로 교체한다. `@/lib/axes`를 참조하는 나머지 import가
있다면 `@/lib/kpis`의 대응 export로 교체한다(예: `meetingSessionTitle`은 이름이 동일하게 유지됨).

- [ ] **Step 2: 확인**

Run: `cd mobile && npx tsc --noEmit`
Expected: 전체 프로젝트에서 `@/lib/axes` 참조로 인한 에러가 더 이상 없음

- [ ] **Step 3: Commit**

```bash
git add mobile/src/app/index.tsx
git commit -m "fix(mobile): drop obsolete weightFootnote prop from ScoreGridTab call site"
```

---

## Task 18: 모바일 — 표2 상세화면(`statement/[id].tsx`) KPI·인용·이슈 섹션

**Files:**
- Modify: `mobile/src/app/statement/[id].tsx`

**Interfaces:**
- Consumes: `KPIS`/`KPI_LABELS`/`kpiCellLabel`(Task 12), 갱신된 `InsightRow`(Task 13).
- Produces: 없음(리프 화면).

- [ ] **Step 1: import 및 점수 배지·그리드 교체**

`mobile/src/app/statement/[id].tsx`의 1~7행, 42~53행을 교체. import:

```tsx
import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ScrollView, Text, View, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { fetchInsightWithSiblings, type InsightRow } from "@/lib/api";
import { KPIS, KPI_LABELS, kpiCellLabel } from "@/lib/kpis";
import { colors, typography, spacing, radius } from "@/theme/tokens";
```

가중평균 배지 + 8축 그리드(42~53행)를 KPI 그리드로 교체:

```tsx
      <View style={styles.scoreGrid}>
        {KPIS.map((kpi) => (
          <View key={kpi} style={styles.scoreGridItem}>
            <Text style={styles.scoreGridLabel}>{KPI_LABELS[kpi]}</Text>
            <Text style={styles.scoreGridValue}>{kpiCellLabel(row, kpi)}</Text>
          </View>
        ))}
      </View>
```

(`scoreBadge`/`scoreBadgeLabel` 관련 `<View>`는 종합점수가 폐지되었으므로 통째로 삭제한다.)

- [ ] **Step 2: 인용 근거·제안요소 섹션 추가**

"요약"(66행) 앞에 아래 섹션 삽입 — `citations`/`proposals`/`qaRounds`/`selfRaisedIssues`는
이미 Task 10(backend `getInsightRows()`)과 Task 13(mobile `InsightRow`)에서 정의되어 있으므로
그대로 사용한다.

`statement/[id].tsx`에 섹션 추가:

```tsx
      <Text style={styles.sectionTitle}>인용 근거</Text>
      {row.citations.length > 0 ? (
        row.citations.map((c, i) => (
          <Text key={i} style={styles.body}>
            [{c.type}] {c.text}
          </Text>
        ))
      ) : (
        <Text style={styles.body}>없음</Text>
      )}

      {row.proposals.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>제안 요소 체크</Text>
          {row.proposals.map((p, i) => (
            <Text key={i} style={styles.body}>
              제안 {i + 1}: 예산{p.budget ? "✓" : "✗"} 시기{p.timeline ? "✓" : "✗"} 주체
              {p.subject ? "✓" : "✗"} 방법{p.method ? "✓" : "✗"}
            </Text>
          ))}
        </>
      )}

      {row.qaRounds.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>질의응답 왕복</Text>
          {row.qaRounds.map((r) => (
            <Text key={r.roundIndex} style={styles.body}>
              round {r.roundIndex + 1}: {r.answerGrade}
              {r.bonusTags.length > 0 ? ` (${r.bonusTags.join(", ")})` : ""}
            </Text>
          ))}
        </>
      )}

      {row.selfRaisedIssues.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>등록된 이슈</Text>
          {row.selfRaisedIssues.map((issue, i) => (
            <Text key={i} style={styles.body}>
              · {issue.description}
            </Text>
          ))}
        </>
      )}
```

- [ ] **Step 3: siblings 정렬 기준 갱신**

`siblings.map`(76~83행) 위쪽에서 `s.weightedScore.toFixed(2)`를 참조하는 부분을
`kpiCellLabel(s, "evidenceDensity")`로 교체:

```tsx
              <View style={styles.siblingHeaderRow}>
                <Text style={styles.siblingScore}>{kpiCellLabel(s, "evidenceDensity")}</Text>
                <Text style={styles.siblingTopic}>{s.tags[0] ?? s.summary.slice(0, 24)}</Text>
              </View>
```

- [ ] **Step 4: 확인**

Run: `cd mobile && npx tsc --noEmit`
Expected: 전체 mobile 프로젝트에서 타입 에러 없음(이 태스크가 8축 제거 작업의 마지막 소비처)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/app/statement/[id].tsx
git commit -m "feat(mobile): show citations, proposal checklist, Q&A rounds, issue tickets in statement detail"
```

---

## Task 19: 전체 검증 및 파일럿 재처리

**Files:**
- 없음(검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1~18의 모든 산출물.
- Produces: 없음.

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd backend && npx vitest run`
Expected: 모든 테스트 PASS (Task 4~11에서 작성/수정한 테스트 전부 포함)

- [ ] **Step 2: 백엔드 typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 모바일 typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 파이프라인 실제(또는 픽스처) 재처리**

Run: `cd backend && npx tsx scripts/pipeline/run.ts`
Expected: `statementInsights`에 5-KPI 값이 정상 기록됨(로그에서 `outcome: "processed"` 확인).
Task 8 Step 1에서 확인한 기존 8축 데이터가 있었다면, 이 실행으로 전량 재처리된다.

- [ ] **Step 5: API 응답 확인**

Run: `cd backend && npm run dev` (백그라운드), 다른 터미널에서 `curl http://localhost:3000/api/insights | head -c 500`
Expected: 응답 JSON에 `kpiEvidenceDensity`/`kpiSolutionSpecificity`/`kpiInterrogationDepth`/
`kpiCommitmentRate` 필드가 있고 8축 필드(`creativity` 등)는 없음

- [ ] **Step 6: 모바일 수동 QA**

Run: `cd mobile && npx expo start`
확인 항목: 탭1(개요)/탭2(세부항목)/탭3(전체의원랭킹)에서 KPI 선택 칩으로 정렬 기준이
바뀌는지, N/A가 "―"로 표시되는지, 표2 상세화면에서 인용근거·제안요소·질의응답왕복·이슈 섹션이
보이는지, 전체의원랭킹의 이슈지속추적률 열이 "추적 중" 또는 "%(등급)"으로 표시되는지.

- [ ] **Step 7: 문서-구현 일치 최종 대조**

`docs/rubric/CLAUDE.md` §3·§6의 필드명(`citations`, `proposals`, `qaRounds`,
`kpiEvidenceDensity` 등)이 `backend/db/schema.ts`·`backend/lib/queries/insights.ts`·
`mobile/src/lib/api.ts`의 실제 필드명과 1:1로 일치하는지 확인. 불일치가 있으면 문서를
구현에 맞춰 수정한다(구현이 아니라 문서를 고친다 — 코드가 실제 동작의 진실이다).

- [ ] **Step 8: 최종 커밋(필요 시)**

Step 4~7에서 파일 변경이 발생했다면(예: Step 4의 재처리로 실제 DB 값이 바뀐 것은 커밋 대상이
아니지만, Step 7에서 문서를 고쳤다면):

```bash
git add -A
git commit -m "docs: reconcile rubric field names with final implementation"
```
