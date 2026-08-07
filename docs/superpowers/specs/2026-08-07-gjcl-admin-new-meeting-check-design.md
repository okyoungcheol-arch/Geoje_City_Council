# 거제시의회 AI 인사이트 앱 — 관리자용 신규 회의 체크·처리 기능 Design Spec

**Date:** 2026-08-07
**Status:** Approved

## Problem

gjcl.go.kr에 새 회의록이 올라오면, 지금은 사람이 직접 로컬 터미널에서 `scripts/scrape/run.ts`와 `scripts/pipeline/run.ts`를 수동으로 돌려야 한다. 관리자(운영자)가 모바일 앱 안에서 "새 회의가 있는지 확인하고, 있으면 처리를 시작"할 수 있는 최소한의 관리 기능이 필요하다.

## Goal

1. 관리자가 앱에서 gjcl.go.kr을 확인해 DB에 아직 없는 신규 회의를 목록으로 본다.
2. 원하는 회의를 선택해 회의록 텍스트를 스크래핑한다(발언 원문만, AI 처리 전).
3. 미채점 발언 전체(신규분 포함)에 대해 8축 AI 채점(Sonnet5 요약 → Opus5 채점, 커밋된 파이프라인 그대로)을 시작하고 진행 상황을 지켜본다.

## Non-Goals

- **완전 자동화/주기적 크론은 하지 않는다.** 기존 v1/v2 design.md의 "자동 스케줄링/주기적 업데이트는 1차 범위 제외" 원칙을 그대로 유지한다 — 이 기능은 어디까지나 **사람이 버튼을 눌러야 동작하는 수동 트리거**이며, 자동화가 아니다.
- 정교한 계정 시스템(회원가입/역할 관리 등)은 만들지 않는다. PIN 잠금 수준으로 충분하다.
- Opus 5 계정 단위 rate limit(이번 세션에서 확인된 계정당 낮은 처리량 제한) 자체를 해결하지 않는다 — 이 기능은 트리거를 쉽게 만들 뿐, 처리 속도 자체는 여전히 그 제약을 따른다.

## Architecture

```
[관리자 화면(모바일, PIN 잠금)] --HTTP + x-admin-pin--> [/api/admin/*] --재사용--> [기존 스크래퍼 + 파이프라인 로직]
```

- Cron 없음. Vercel Hobby 플랜은 Cron을 하루 1번만 허용하는데(확인됨), 그 주기로는 회의 하나 처리에 며칠씩 걸릴 수 있어 부적합하다고 판단.
- 대신 **관리자 화면이 열려있는 동안, 모바일 앱이 처리용 API를 3~5초 간격으로 직접 반복 호출**한다. 화면을 닫으면 멈추고, 다시 열면 DB의 미처리 항목을 다시 조회해 이어서 진행한다(요금제 제약과 무관하게 동작).
- 새 DB 테이블 없음 — 기존 `meetings`/`statements`/`statement_insights`를 그대로 재사용. "체크"는 매번 사이트 목록과 DB를 실시간 대조하는 읽기 전용 작업이다.

## API 엔드포인트

모든 엔드포인트는 요청 헤더 `x-admin-pin`을 `ADMIN_PIN` 환경변수와 비교해 검증한다. 불일치/누락 시 401.

### `POST /api/admin/check-new-meetings`

- 기존 `scrapeCategories` + `scrapeMeetingList`(`scripts/scrape/meetingList.ts`)를 전체 카테고리(본회의·상임위원회 4종·예산결산특별위원회·인사청문특별위원회·행정사무감사 등, 기존 스크래핑 범위와 동일)에 대해 재실행한다.
- 결과를 `meetings.sourceMeetingId`와 대조해 DB에 없는 회의만 추려 반환한다. **DB에 아무것도 쓰지 않는다.**
- 응답: `{ newMeetings: { sourceMeetingId: string; title: string; category: string; sessionRound: string }[] }`
- 구현상 참고: 세션 라운드가 많아 시간이 걸릴 경우, 이미 전량 확보된 회차를 건너뛰는 최적화를 추가할 수 있다(1차 구현에서는 필수 아님 — 실측 후 필요하면 후속 개선).

### `POST /api/admin/scrape-meeting`

- Body: `{ sourceMeetingId: string }`
- 해당 회의 1건만 `scrapeMinutes`로 원문 스크래핑 → `meetings`/`agendaItems`/`statements`/`members`에 upsert (기존 idempotent 로직 재사용, 5분자유발언 제외 등 기존 안전장치 그대로 적용됨).
- AI 파이프라인은 호출하지 않는다 — 원문 텍스트만 저장한다.
- 응답: `{ statementsAdded: number }`

### `POST /api/admin/process-batch`

- Body: `{ limit?: number }` — 서버에서 최댓값(20)으로 강제 클램프(한 호출이 재시도로 너무 오래 도는 것을 방지).
- `scripts/pipeline/run.ts`의 문장 단위 처리 로직(비의원 제외 → 의사진행 제외 → Sonnet 요약 → 8축 Opus 채점 → 가중평균 계산 → 저장)을 `lib/pipeline/processStatement.ts`로 추출해 CLI 스크립트와 이 API가 함께 재사용한다. 로직 중복 구현 금지.
- 응답: `{ processed: number; excluded: number; failed: number; remaining: number }`
- 실패한 문장은 `statement_insights`에 기록되지 않으므로 자동으로 "미처리" 상태를 유지하며 다음 호출에서 재시도된다(기존 파이프라인과 동일한 동작).

## 모바일 관리자 화면

- **진입**: 기존 필터 화면(의원별/회의별/발언유형별)에 "관리자" 메뉴 항목 추가.
- **PIN 화면**: 4~6자리 입력 → 서버 검증 → `expo-secure-store`에 저장(앱 재설치 시 초기화, 별도 로그아웃 기능 불필요).
- **관리자 홈**:
  - `[신규 회의 체크]` 버튼 → 로딩 → 신규 회의 리스트 표시(없으면 "신규 회의 없음"). 각 항목에 `[스크래핑]` 버튼.
  - `[스크래핑]` 탭 → 로딩 → "발언 N건 추가됨" 완료 메시지.
  - `[처리 대기중인 발언]` 섹션: 전체 미채점 문장 수 표시 + `[처리 시작]` 버튼.
  - 처리 시작 시 진행 화면으로 전환: 진행바 + "127/342 처리됨 (제외 89건, 실패 12건)", 3~5초 간격 자동 반복 호출, `[일시정지]` 버튼, 화면 이탈 시 자동 정지.

## Error Handling

- PIN 불일치/누락 → 401, 프론트에서 "잘못된 PIN" 토스트.
- `check-new-meetings`가 사이트 구조 변경 등으로 실패 → 500 + 에러 메시지, 프론트에서 재시도 버튼 노출.
- `scrape-meeting`/`process-batch`는 idempotent upsert 기반이라 중간 실패 후 재호출해도 안전.

## Testing / Validation

- `lib/pipeline/processStatement.ts`(추출된 공용 함수): 기존 `score.test.ts`/`summarize` 테스트처럼 AI 호출을 mock한 유닛 테스트.
- `check-new-meetings`의 diff 로직: 스크래퍼를 mock해 알려진 DB 상태 + 알려진 스크래핑 결과를 주고 신규 목록이 정확히 걸러지는지 검증.
- PIN 검증 미들웨어: 정상/오류(불일치·누락) 케이스 유닛 테스트.
- 수동 QA: 실제 신규 회의가 뜨면 체크→스크래핑→처리 전체 흐름을 모바일 앱에서 직접 실행해 확인.

## Key Decisions (User-Approved)

| 항목 | 결정 |
|---|---|
| 접근 제어 | 간단한 PIN 1개로 잠금(별도 계정 체계 없음) |
| 체크 범위 | 전체 카테고리(본회의만이 아니라 기존 스크래핑 범위 전체) |
| "처리" 버튼 동작 | 스크래핑만 즉시 동기 실행. AI 채점은 관리자 화면이 열려있는 동안 앱이 직접 반복 호출 |
| 백그라운드 처리 방식 | Vercel Cron 미사용(Hobby 플랜 1일 1회 제약 회피) — 클라이언트(모바일 앱) 주도 폴링 |
| DB 스키마 변경 | 없음 (기존 테이블 재사용) |
| 자동화 범위 | 여전히 100% 수동 트리거 — 기존 "자동 스케줄링 제외" 원칙 유지 |
