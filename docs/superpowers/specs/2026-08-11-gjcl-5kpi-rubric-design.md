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
