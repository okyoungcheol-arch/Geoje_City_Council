# harness.md — 실행 하네스 (스크래핑 + AI 파이프라인)

이 문서는 `backend/`에 있는 배치 스크립트들을 **어떻게, 어떤 순서로, 어떤 환경에서** 실행하는지 설명합니다. 각 AI 에이전트 자체의 역할은 [agent.md](agent.md)를, 전체 설계는 [Design.md](Design.md)를 참고하세요.

## 실행 순서 (1회성 배치)

```
1. scripts/scrape/run.ts     회의 목록 + 회의록 텍스트 수집 → meetings/members/agendaItems/statements 테이블
2. scripts/pipeline/run.ts   미처리 statements를 Sonnet5→Opus5로 처리 → statement_insights 테이블
3. (배포 후) /api/insights   위 결과를 JSON으로 제공, 모바일 앱이 호출
```

두 스크립트 모두 `backend/` 디렉터리에서 `npx tsx <경로>`로 직접 실행합니다. 별도의 큐/스케줄러는 없습니다 (1차 범위: 과거 회의 일괄 배치만).

## 필요한 환경변수

`backend/.env.local` (또는 `.env`)에 다음이 있어야 합니다:

| 변수 | 용도 | 발급 방법 |
|---|---|---|
| `DATABASE_URL` | Postgres(Neon) 연결 문자열 | `vercel link` → `vercel integration add neon --yes --no-claim` → `vercel env pull .env.local --yes` |
| `VERCEL_OIDC_TOKEN` | AI Gateway 인증 (OIDC, ~24시간 유효) | `vercel env pull .env.local --yes` 로 자동 발급, 만료되면 다시 `pull` |
| `AI_GATEWAY_API_KEY` (선택) | Vercel 인프라 밖에서 파이프라인을 돌릴 때만 필요한 수동 키 | Vercel 대시보드 → 프로젝트 설정 → AI Gateway |

`drizzle-kit`와 `tsx`는 `.env.local`을 자동으로 읽지 않으므로, 필요하면 다음처럼 명시적으로 로드하세요:

```bash
npx dotenv -e .env.local -- npx tsx scripts/scrape/run.ts
npx dotenv -e .env.local -- npx tsx scripts/pipeline/run.ts
```

(Next.js 개발 서버(`npm run dev`)는 `.env.local`을 자동으로 읽습니다 — API 라우트에는 위 dotenv 래퍼가 필요 없습니다.)

## 재시도 / 멱등성 계약

- **스크래핑 (`scripts/scrape/run.ts`):** `meetings.sourceMeetingId`, `members.(name, generation)`, `statements.(meetingId, memberId, orderInMeeting)`에 unique 인덱스를 걸고 `onConflictDoUpdate`/`onConflictDoNothing`으로 upsert합니다. 몇 번을 다시 실행해도 중복 행이 생기지 않습니다.
- **AI 파이프라인 (`scripts/pipeline/run.ts`):** 시작할 때 `statement_insights.statementId`가 이미 존재하는 행을 조회해 건너뜁니다. 즉 중간에 실패해도 처음부터 다시 돌릴 수 있고, 이미 처리된 발언에 대해 중복 과금이 발생하지 않습니다.
- **개별 호출 실패:** Sonnet 5/Opus 5 호출이 실패하면 지수 백오프로 최대 3회 재시도합니다 (`withRetry`, 1s/2s/4s). 3회 모두 실패하면 해당 statement는 실패 목록에 기록되고 콘솔에 로그가 남지만, **배치 전체는 계속 진행**됩니다.

## 운영 시 체크리스트

1. `scripts/scrape/run.ts`를 실행해 콘솔에 1페이지분 결과가 정상적으로 찍히는 것을 확인하면 Ctrl-C로 중단 → drizzle-kit studio로 검수, 문제없으면 다시 실행해 전체 페이지를 끝까지 처리
3. `scripts/pipeline/run.ts`를 `.limit(10)`으로 좁혀 시험 실행 → 채점 결과를 사람이 눈으로 검수 (루브릭이 원문과 맞는지)
4. 문제없으면 전체 배치 실행
5. 실패 목록이 있으면 원인을 확인하고 (사이트 구조 변경? Gateway 오류?) 재실행 — 이미 처리된 항목은 자동으로 건너뛴다

## 배포 시 차이점

Vercel에 배포된 `backend/`는 `VERCEL_OIDC_TOKEN`을 자동으로 관리하므로 별도 조치가 필요 없습니다. `DATABASE_URL`만 Vercel 프로젝트의 프로덕션 환경변수로 설정되어 있으면 됩니다. 배치 스크립트(`scripts/scrape`, `scripts/pipeline`)는 Vercel Functions로 배포되는 것이 아니라 **로컬(또는 CI)에서 수동 실행**하는 것을 전제로 합니다 — 실행 시간이 길고 스케줄링이 필요 없는 1회성 작업이기 때문입니다.
