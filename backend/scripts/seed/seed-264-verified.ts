// backend/scripts/seed/seed-264-verified.ts
//
// 제264회 임시회 회의록을 사람이 직접 검토해 산출한 5-KPI 실측 검증값을 statement_insights에
// 시딩한다. AI 파이프라인 재실행이 아니다 — Sonnet5/Opus5를 호출하지 않는다. 대상 7인의 실제
// statementId/meetingId는 사전 조회(scripts/seed/_lookup-264.ts, 삭제됨)로 사람이 직접 확인한
// 값이다. 재실행해도 안전하도록 각 statementId에 대해 upsert(있으면 UPDATE, 없으면 INSERT)한다.
//
// 출처 투명성: rubricVersion="v2.0-5kpi-264-verified-sample", sonnetModel="manual-verified"로
// 표시해 파이프라인 산출물과 구분한다 — docs/rubric/CLAUDE.md §7 참고.
import { db } from "@/db/client";
import { statementInsights, issueTickets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  computeEvidenceDensity,
  computeSolutionSpecificity,
  computeInterrogationDepth,
  computeCommitmentRate,
} from "@/lib/scoring/kpi";
import type { Citation, Proposal } from "@/lib/ai/summarize";
import type { QaRound } from "@/lib/ai/extractQaRounds";

const RUBRIC_VERSION = "v2.0-5kpi-264-verified-sample";
const SONNET_MODEL = "manual-verified";

interface SeedRow {
  member: string;
  statementId: number;
  meetingId: number;
  wordCount: number;
  citations: Citation[];
  proposals: Proposal[];
  hasQaStructure: boolean;
  qaRounds: QaRound[];
  tags: string[];
  summary: string;
  rationale: string;
}

const rows: SeedRow[] = [
  {
    member: "이태열",
    statementId: 1450,
    meetingId: 9,
    wordCount: 437,
    citations: [
      { type: "P", text: "「신안군 신·재생에너지 개발이익 공유 등에 관한 조례」— 신안군 사례 특정" },
      { type: "S", text: "신안군 오비마을 발전기금: 3억 4000만 원 일시불" },
      { type: "S", text: "신안군 오비마을 발전기금: 매년 2000만 원" },
      { type: "S", text: "지급 대상 마을 4개, 1년에 500만 원씩" },
      { type: "S", text: "신안군 햇빛아동수당 지급 사례" },
      { type: "S", text: "지분참여·시설참여를 통한 수익 배분 구조(협동조합 형태)" },
      { type: "S", text: "춘광아파트 도시가스 인입 완료 현황" },
      { type: "S", text: "미광아파트 도시가스 미인입 현황" },
      { type: "S", text: "28페이지 햇빛소득마을 시범 추진 실적 0건" },
      { type: "S", text: "신안군 오비리 수소연료 사업 예산 규모" },
      { type: "S", text: "발전이익 공유 방식과 발전기금 지급 방식의 차이" },
      { type: "S", text: "20페이지 관련 사업 진행 현황" },
      { type: "S", text: "25페이지 관련 사업 예산 편성 내역" },
      { type: "S", text: "주민 상대적 박탈감 관련 민원 현황(도시가스 인입 지역 격차)" },
      { type: "S", text: "신안군 사례 대비 거제시 햇빛소득마을 추진률 비교" },
    ],
    proposals: [
      { budget: true, timeline: true, subject: false, method: false },
      { budget: true, timeline: false, subject: false, method: true },
      { budget: false, timeline: false, subject: true, method: true },
    ],
    hasQaStructure: false,
    qaRounds: [],
    tags: ["햇빛소득마을", "신안군", "발전이익공유", "도시가스인입"],
    summary:
      "신안군의 신·재생에너지 개발이익 공유 조례와 발전기금 지급 사례를 근거로, 거제시 햇빛소득마을 사업이 " +
      "매우 저조함을 지적하고 지분참여형 수익 공유 구조 도입과 도시가스 인입 지역 격차 해소를 요구했다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 신안군 관련 수치 15종 " +
      "집중 인용(437어절 기준 사전준비도 3.43/A)에 따른 것으로, 단일 사례 의존이라는 약점도 함께 고려한다.",
  },
  {
    member: "한은진",
    statementId: 581,
    meetingId: 8,
    wordCount: 548,
    citations: [
      { type: "L", text: "공공갈등 관리 관련 조례 근거 조항 인용" },
      { type: "L", text: "여성친화도시 조성 관련 법령 근거 인용" },
      { type: "S", text: "성인지 통계 지표 인용" },
      { type: "S", text: "공공갈등 진단 결과 관련 수치" },
      { type: "S", text: "다년간 누적 갈등 건수 현황" },
      { type: "P", text: "타 지자체 일자리협의체 운영 사례" },
      { type: "P", text: "타 지자체 안전 TF 구성 사례" },
      { type: "P", text: "타 지자체 시민참여단 운영 사례" },
      { type: "P", text: "공공갈등 조정협의회 미구성 문제 지적" },
      { type: "P", text: "타 지자체 공청회 운영 사례" },
      { type: "F", text: "행정복지위원회 업무보고 현장 확인 사항" },
    ],
    proposals: [
      { budget: false, timeline: true, subject: true, method: true },
      { budget: false, timeline: true, subject: true, method: true },
      { budget: true, timeline: false, subject: true, method: true },
    ],
    hasQaStructure: false,
    qaRounds: [],
    tags: ["공공갈등조정협의회", "여성친화도시", "성인지통계"],
    summary:
      "공공갈등 진단은 실시했으나 조정협의회를 구성·운영하지 않는 문제를 지적하고, 부서 차원 대응의 한계를 " +
      "넘어선 갈등에 대해 협의체·TF·공청회 등 구조화된 대응 체계 도입을 요구했다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 조례 제정·성인지 통계·일자리협의체·" +
      "안전 TF·공청회·시민참여단 등 실행 단위까지 대안을 분해했으나 착수 시점은 미제시.",
  },
  {
    member: "옥은림",
    statementId: 1867,
    meetingId: 9,
    wordCount: 508,
    citations: [
      { type: "S", text: "사업비 42억 원 중 국비·도비 비율 현황" },
      { type: "S", text: "수질·토양·방사능 검사 결과 공개 현황" },
      { type: "S", text: "해수욕장별 수질 검사 시행 현황" },
      { type: "S", text: "해파리 방지막 시범 설치 후 20일 경과 현황" },
      { type: "S", text: "1차 사업 선정 50개, 2차 사업 선정 17개" },
      { type: "S", text: "DX 기술 도입 조선소 개수 현황" },
      { type: "P", text: "상동 소류지 수변공원 조성 대비 소공원 전환 사례" },
      { type: "P", text: "타 지자체 문화예술 지원사업 모니터링·간담회 사례" },
    ],
    proposals: [
      { budget: true, timeline: true, subject: true, method: true },
      { budget: true, timeline: false, subject: false, method: true },
      { budget: true, timeline: false, subject: true, method: false },
    ],
    hasQaStructure: false,
    qaRounds: [],
    tags: ["국비도비비율", "수질검사공개", "소공원전환"],
    summary:
      "국비·도비 비율이 낮은 사업 구조와 해수욕장 수질 검사 결과의 시민 접근성 부족을 지적하고, 상동 " +
      "소류지 수변공원을 소공원으로 전환할 경우의 예산 절감·절차 간소화 논거를 제시했다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 소공원 전환 시 예산 절감·절차 " +
      "간소화라는 재원 논거는 제시했으나 담당 부서 특정은 없음.",
  },
  {
    member: "김미영",
    statementId: 556,
    meetingId: 8,
    wordCount: 533,
    citations: [
      { type: "S", text: "지방자치단체 혁신 평가 '우수기관' 선정(2월)" },
      { type: "F", text: "조명 위치·밝기 현장 점검 사항" },
      { type: "F", text: "교량 하부 물고임 현장 확인" },
      { type: "F", text: "배수그레이팅 현장 점검 사항" },
      { type: "F", text: "보행로 현장 점검 사항" },
      { type: "L", text: "조례 입법평가 연구용역 관련 근거 인용" },
      { type: "P", text: "타 지자체 조직문화 진단계획 연계 사례" },
    ],
    proposals: [
      { budget: true, timeline: true, subject: true, method: false },
      { budget: true, timeline: true, subject: false, method: false },
    ],
    hasQaStructure: false,
    qaRounds: [],
    tags: ["조직문화혁신", "안전점검", "조례입법평가"],
    summary:
      "지방자치단체 혁신 평가 우수기관 선정이 실제 조직문화 개선 체감으로 이어지는지 확인을 요구하고, " +
      "조명·교량 하부 물고임·배수그레이팅·보행로 등 현장 점검 항목 단위로 안전 관리 강화를 제안했다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 조명 위치·밝기, 교량 하부 물고임, " +
      "배수그레이팅, 보행로 등 점검 항목 단위로 명시했으나 대안 수 자체가 2건.",
  },
  {
    member: "윤현아",
    statementId: 367,
    meetingId: 8,
    wordCount: 456,
    citations: [
      { type: "S", text: "시민패널 2,871명, 평균참여율 26.4%" },
      { type: "S", text: "정책제안 262건 중 공감도 50% 이상 채택 22건" },
      { type: "S", text: "정책 반영률 관련 후속 수치" },
      { type: "P", text: "타 지자체 시민참여 플랫폼 운영 사례" },
    ],
    proposals: [
      { budget: true, timeline: true, subject: false, method: false },
      { budget: true, timeline: false, subject: true, method: false },
      { budget: true, timeline: false, subject: false, method: false },
      { budget: false, timeline: true, subject: false, method: false },
    ],
    hasQaStructure: false,
    qaRounds: [],
    tags: ["시민참여예산", "정책제안채택률", "K-푸드로드"],
    summary:
      "시민참여예산 정책제안 262건 중 공감도 50% 이상인데도 채택은 22건에 불과한 이유와, 시민 제안이 " +
      "실제 정책으로 이어지는 비율이 낮은 구조적 원인을 질의했다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 대안 수는 최다(4건)이나 " +
      "'스토리를 콘텐츠로', '홍보의 문을 넓혀야' 등 수단이 추상적.",
  },
  {
    member: "최양희",
    statementId: 24,
    meetingId: 3,
    wordCount: 458,
    citations: [
      { type: "L", text: "「지방자치단체 보조금 관리에 관한 법률」 제7조제2항 — 공모절차 의무조항" },
      { type: "S", text: "저도 개방 기념행사 당초예산 5000만 원" },
      { type: "S", text: "추경 변경 후 예산 금액 동일(5000만 원)" },
      { type: "P", text: "예산 추경 심사 당시 답변 내용과의 비교" },
    ],
    proposals: [{ budget: false, timeline: false, subject: true, method: true }],
    hasQaStructure: true,
    qaRounds: [
      { roundIndex: 0, answerGrade: "회피", bonusTags: ["모순포착"] },
      { roundIndex: 1, answerGrade: "회피", bonusTags: ["패턴제시"] },
      { roundIndex: 2, answerGrade: "회피", bonusTags: ["쟁점고정"] },
      { roundIndex: 3, answerGrade: "회피", bonusTags: ["법근거제시"] },
    ],
    tags: ["저도개방보조금", "공모절차", "보조금관리법"],
    summary:
      "저도 개방 기념행사 예산을 당초예산의 일반운영비(직접 수행)에서 추경에 민간행사 사업보조로 목을 " +
      "변경한 경위를 추궁하며, 「지방자치단체 보조금 관리에 관한 법률」 제7조제2항의 공모절차 의무를 " +
      "근거로 특정 단체 지정 편성의 절차 위반을 지적했다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 질의 1건, 왕복 4턴으로 " +
      "실시간 압박력은 최고 수준(4.0)이었으나, 관광국장은 원칙 인정('보조금은 공모를 거치는 게 기본 " +
      "원칙은 맞습니다')까지만 하고 최종적으로 '다시 한 번 검토해 보겠습니다'로 종결 — 성과전환력은 " +
      "0%. 실시간 압박력(최고)과 성과전환력(최저)이 동시에 나타나는 사례로, 잘 추궁했으나 확답까지는 " +
      "못 갔다는 진단을 보여준다.",
  },
  {
    member: "신수정",
    statementId: 375,
    meetingId: 8,
    wordCount: 436,
    citations: [{ type: "S", text: "미채택 부분 116건(출처·집계 기준 불명)" }],
    proposals: [
      { budget: true, timeline: true, subject: true, method: false },
      { budget: true, timeline: true, subject: false, method: false },
      { budget: true, timeline: false, subject: true, method: false },
    ],
    hasQaStructure: false,
    qaRounds: [],
    tags: ["거제야호", "미채택관리", "순환투어버스"],
    summary:
      "시민참여예산 제안 중 미채택 116건의 관리 방식을 질의했으나, 유일한 수치 근거의 출처와 집계 " +
      "기준이 불명확하다는 한계가 있다.",
    rationale:
      "제264회 임시회 실측 검증 데이터 — 수기 입력(AI 파이프라인 미실행). 유일 수치(116건)마저 " +
      "출처·집계 기준이 불명.",
  },
];

const TICKETS: {
  member: string;
  description: string;
  reviewCheckpoint: string;
  statementId: number;
  meetingId: number;
}[] = [
  { member: "옥은림", description: "중앙도서관 공사기간 임시 대체공간 마련", reviewCheckpoint: "착공 후 첫 회기", statementId: 1867, meetingId: 9 },
  { member: "옥은림", description: "상동 소류지 수변공원 → 소공원 전환", reviewCheckpoint: "다음 정례회", statementId: 1867, meetingId: 9 },
  { member: "윤현아", description: "K-푸드로드 9억 원 5개월 집행 실적", reviewCheckpoint: "2026년 결산", statementId: 367, meetingId: 8 },
  { member: "이태열", description: "햇빛소득마을 제1호 시범마을 추진", reviewCheckpoint: "다음 정례회", statementId: 1450, meetingId: 9 },
  { member: "김미영", description: "아주천 구름다리 등 횡단시설 (경남도 협의)", reviewCheckpoint: "다음 정례회", statementId: 556, meetingId: 8 },
  { member: "한은진", description: "여성친화도시 조성 조례 제정", reviewCheckpoint: "다음 정례회", statementId: 581, meetingId: 8 },
  { member: "신수정", description: "거제야호 브랜드 통합 · 순환 투어버스", reviewCheckpoint: "다음 정례회", statementId: 375, meetingId: 8 },
  { member: "최양희", description: "저도 개방 기념행사 보조금 공모 절차 이행", reviewCheckpoint: "집행 전", statementId: 24, meetingId: 3 },
];

async function upsertStatementInsight(row: SeedRow) {
  const evidenceDensity = computeEvidenceDensity(row.citations, row.wordCount);
  const solutionSpecificity = computeSolutionSpecificity(row.proposals);
  const interrogationDepth = computeInterrogationDepth(row.qaRounds);
  const commitmentRate = computeCommitmentRate(row.qaRounds);

  const values = {
    statementId: row.statementId,
    summary: row.summary,
    tags: row.tags,
    excludedReason: null,
    speechType: "budget_review",
    hasQaStructure: row.hasQaStructure,
    citations: row.citations,
    kpiEvidenceDensity: evidenceDensity.value === null ? null : String(evidenceDensity.value),
    kpiEvidenceDensityGrade: evidenceDensity.grade,
    proposals: row.proposals,
    kpiSolutionSpecificity: solutionSpecificity === null ? null : String(solutionSpecificity),
    qaRounds: row.qaRounds,
    kpiInterrogationDepth: interrogationDepth === null ? null : String(interrogationDepth.value),
    kpiReQuestionRate: interrogationDepth === null ? null : String(interrogationDepth.reQuestionRate),
    kpiCommitmentRate: commitmentRate === null ? null : String(commitmentRate),
    selfRaisedIssues: [],
    rationale: row.rationale,
    rubricVersion: RUBRIC_VERSION,
    sonnetModel: SONNET_MODEL,
    opusModel: null,
  };

  const [existing] = await db
    .select({ id: statementInsights.id })
    .from(statementInsights)
    .where(eq(statementInsights.statementId, row.statementId));

  if (existing) {
    await db.update(statementInsights).set(values).where(eq(statementInsights.statementId, row.statementId));
    console.log(`  [${row.member}] statementId=${row.statementId} UPDATE (사전준비도=${evidenceDensity.value}/${evidenceDensity.grade})`);
  } else {
    await db.insert(statementInsights).values(values);
    console.log(`  [${row.member}] statementId=${row.statementId} INSERT (사전준비도=${evidenceDensity.value}/${evidenceDensity.grade})`);
  }
}

async function seedIssueTicket(t: (typeof TICKETS)[number], memberId: number) {
  const [existing] = await db
    .select({ id: issueTickets.id })
    .from(issueTickets)
    .where(and(eq(issueTickets.memberId, memberId), eq(issueTickets.description, t.description)));

  if (existing) {
    console.log(`  [${t.member}] "${t.description}" 이미 존재 (ticketId=${existing.id}) — 건너뜀`);
    return;
  }

  const [inserted] = await db
    .insert(issueTickets)
    .values({
      memberId,
      description: t.description,
      registeredStatementId: t.statementId,
      registeredMeetingId: t.meetingId,
      status: "open",
      reviewCheckpoint: t.reviewCheckpoint,
    })
    .returning({ id: issueTickets.id });
  console.log(`  [${t.member}] "${t.description}" INSERT (ticketId=${inserted.id}, 확인시점=${t.reviewCheckpoint})`);
}

async function main() {
  const { members } = await import("@/db/schema");
  const { normalizeMemberName } = await import("@/lib/members/roster");
  const allMembers = await db.select().from(members);
  const memberIdByNormalizedName = new Map<string, number>();
  for (const m of allMembers) {
    const normalized = normalizeMemberName(m.name);
    if (!memberIdByNormalizedName.has(normalized)) memberIdByNormalizedName.set(normalized, m.id);
  }

  console.log("=== statement_insights 시딩 ===");
  for (const row of rows) {
    await upsertStatementInsight(row);
  }

  console.log("\n=== issue_tickets 시딩 (T-01 ~ T-08) ===");
  for (const t of TICKETS) {
    const memberId = memberIdByNormalizedName.get(t.member);
    if (!memberId) {
      console.error(`  [${t.member}] members 테이블에서 찾을 수 없음 — 건너뜀`);
      continue;
    }
    await seedIssueTicket(t, memberId);
  }

  console.log("\n완료.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run() failed:", err);
    process.exit(1);
  });
