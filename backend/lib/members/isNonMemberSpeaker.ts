// The scraper (scripts/scrape/minutes.ts) captures whatever label appears in the
// minutes' <strong> speaker tag verbatim as `memberName` — it does not distinguish
// elected council members from executive-branch (집행부) or secretariat (사무국) staff
// who also take turns in the minutes (e.g. "부시장 민기식", "의사팀장 강명수",
// "사무국장 직무대리 윤병삼"). Those speakers are not 의원 and must not be scored
// under a 의정활동(council member performance) rubric — CLAUDE.md's evaluation target
// is council members only.
//
// 의장/부의장/위원장/부위원장 are excluded from this check on purpose: those titles are
// held by elected council members acting in a leadership role, not by staff — their
// substantive statements (as opposed to their procedural ones, filtered separately by
// isProcedural) still belong to a real 의원 and should be scored normally.

const COUNCIL_LEADERSHIP_TITLE = /(의장|위원장)/;

const STAFF_OR_EXECUTIVE_TITLE =
  /(사무국장|의사팀장|팀장|국장|과장|실장|사무관|주사|서기관|주무관|부시장|^시장|직무대리)/;

export function isNonMemberSpeaker(name: string): boolean {
  if (COUNCIL_LEADERSHIP_TITLE.test(name)) return false;
  return STAFF_OR_EXECUTIVE_TITLE.test(name);
}
