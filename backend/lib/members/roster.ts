// 2026년 거제시의회 제10대 당선자 명단 (Data/2026_거제시의원_당선자_명단.xlsx 기준, 16명:
// 지역구 14명 + 비례대표 2명). 스크래퍼는 회의록 <strong> 발언자 태그를 원문 그대로 저장하는데
// (lib/scrape/upsertMeeting.ts), 같은 의원이라도 회의마다 "부의장 당선의원 임수환" / "부의장
// 임수환" / "임수환"처럼 직함 표기가 달라 members 테이블에 별개 인물로 갈라져 저장된다.
// 이 파일은 그 표기를 표시 시점에만 하나로 합치는 용도다 — members 테이블 자체는 건드리지 않는다.
export const MEMBER_ROSTER = [
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
] as const;

const ROSTER_SET = new Set<string>(MEMBER_ROSTER);

/**
 * 스크래핑된 발언자 이름을 명단 기준 이름으로 정규화한다. "부의장 당선의원 임수환"처럼
 * 직함이 앞에 붙어도 공백으로 나눈 마지막 토큰이 명단과 정확히 일치하면 그 이름으로 통일한다.
 * 명단에 없는 이름(비의원 등)은 원문 그대로 반환한다 — 데이터를 임의로 지우거나 바꾸지 않는다.
 */
export function normalizeMemberName(rawName: string): string {
  const trimmed = rawName.trim();
  if (ROSTER_SET.has(trimmed)) return trimmed;

  const tokens = trimmed.split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  if (lastToken && ROSTER_SET.has(lastToken)) return lastToken;

  return trimmed;
}
