// mobile/src/lib/memberRoster.ts
// 2026년 거제시의회 제10대 당선자 명단 (16명). backend/lib/members/roster.ts의 MEMBER_ROSTER를
// 그대로 미러링한다 — mobile은 backend 코드를 import하지 않고 API로만 통신하므로(CLAUDE.md),
// "전체 의원" 필터 목록에서 시의원이 아닌 발언자(재단 이사, 실행부서 직원 등)를 걸러내는 용도로
// 이 화면 전용 상수를 별도로 둔다. backend 명단이 바뀌면 이 목록도 함께 갱신해야 한다.
export const MEMBER_ROSTER = new Set([
  "노재하",
  "임수환",
  "김동수",
  "옥은림",
  "추인호",
  "한은진",
  "안석봉",
  "김영규",
  "김미영",
  "최양희",
  "이미숙",
  "이태열",
  "김경습",
  "윤현아",
  "이재순",
  "신수정",
]);
