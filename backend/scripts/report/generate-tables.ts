// Renders CLAUDE.md §6.2 (표1: 회의 단위 평가표) and §6.3 (표2: 의원별 발언 요약) from the
// live statement_insights data. One 표1 is emitted per meeting that has at least one
// scored (non-excluded) statement, followed by a 표2 section per distinct member across
// all such meetings.
import { db } from "@/db/client";
import { statements, statementInsights, members, meetings } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import { AXIS_WEIGHTS, type Axis } from "@/lib/scoring/weightedAverage";
import type { SpeechType } from "@/lib/ai/summarize";

const AXIS_LABELS: Record<Axis, string> = {
  creativity: "창의성",
  feasibility: "실현가능성",
  evidenceLegal: "근거·법적",
  persistence: "지속성",
  oversight: "견제력",
  citizenBenefit: "시민체감",
  futureStrategy: "미래전략",
  cityDevelopment: "거제발전",
};
const AXIS_ORDER: Axis[] = [
  "creativity",
  "feasibility",
  "evidenceLegal",
  "persistence",
  "oversight",
  "citizenBenefit",
  "futureStrategy",
  "cityDevelopment",
];

function cell(v: number | null, isPersistenceAxis: boolean, persistenceStatus: string | null): string {
  if (isPersistenceAxis && persistenceStatus === "pending_future_evaluation") return "향후 발언평가내용";
  return v === null ? "―" : String(v);
}

async function main() {
  const rows = await db
    .select({
      statementId: statements.id,
      meetingId: statements.meetingId,
      meetingTitle: meetings.title,
      memberName: members.name,
      summary: statementInsights.summary,
      tags: statementInsights.tags,
      topicsToWatch: statementInsights.topicsToWatch,
      speechType: statementInsights.speechType,
      creativity: statementInsights.creativity,
      feasibility: statementInsights.feasibility,
      evidenceLegal: statementInsights.evidenceLegal,
      persistence: statementInsights.persistence,
      persistenceStatus: statementInsights.persistenceStatus,
      oversight: statementInsights.oversight,
      citizenBenefit: statementInsights.citizenBenefit,
      futureStrategy: statementInsights.futureStrategy,
      cityDevelopment: statementInsights.cityDevelopment,
      weightedScore: statementInsights.weightedScore,
      rationale: statementInsights.rationale,
      rawText: statements.rawText,
    })
    .from(statementInsights)
    .innerJoin(statements, eq(statementInsights.statementId, statements.id))
    .innerJoin(meetings, eq(statements.meetingId, meetings.id))
    .innerJoin(members, eq(statements.memberId, members.id))
    .where(isNull(statementInsights.excludedReason));

  const byMeeting = new Map<number, typeof rows>();
  for (const r of rows) {
    if (!byMeeting.has(r.meetingId)) byMeeting.set(r.meetingId, []);
    byMeeting.get(r.meetingId)!.push(r);
  }

  const memberDetail = new Map<string, string>(); // memberName -> 표2 markdown block

  for (const [, meetingRows] of byMeeting) {
    const title = meetingRows[0].meetingTitle.split("\n")[0].trim();
    console.log(`\n### 표1. ${title}\n`);
    console.log(
      "| 의원 | 주제 | 태그(주요발언) | 향후 감시할 주제 | 창의성 | 실현가능성 | 근거·법적 | 지속성 | 견제력 | 시민체감 | 미래전략 | 거제발전 | 가중평균 |"
    );
    console.log("|---|---|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|");

    const speechTypesUsed = new Set<SpeechType>();
    for (const r of meetingRows) {
      speechTypesUsed.add(r.speechType as SpeechType);
      const topic = r.tags?.[0] ?? r.summary.slice(0, 20);
      const tagCells = (r.tags ?? []).map((t) => `\`#${t}\``).join(" ");
      const watchCell = (r.topicsToWatch ?? []).join("; ") || "―";
      const anchor = `#${encodeURIComponent(r.memberName)}`;
      const row = [
        `[${r.memberName}](${anchor})`,
        topic,
        tagCells,
        watchCell,
        cell(r.creativity, false, null),
        cell(r.feasibility, false, null),
        cell(r.evidenceLegal, false, null),
        cell(r.persistence, true, r.persistenceStatus),
        cell(r.oversight, false, null),
        cell(r.citizenBenefit, false, null),
        cell(r.futureStrategy, false, null),
        cell(r.cityDevelopment, false, null),
        `**${r.weightedScore}**`,
      ];
      console.log(`| ${row.join(" | ")} |`);

      // Build 표2 block (last statement per member wins if multiple in this meeting;
      // fine for this demo where each member has exactly one scored statement here)
      memberDetail.set(
        r.memberName,
        `### 표2. ${r.memberName}\n\n**발언 요약**: ${r.summary}\n\n**태그**: ${(r.tags ?? [])
          .map((t) => `#${t}`)
          .join(" ")}\n\n**향후 감시 주제**: ${(r.topicsToWatch ?? []).join("; ") || "없음"}\n\n**채점 근거**: ${r.rationale}\n`
      );
    }

    console.log("\n```");
    for (const st of speechTypesUsed) {
      const w = AXIS_WEIGHTS[st];
      const parts = AXIS_ORDER.map((a) => `${AXIS_LABELS[a]} ${w[a] === null ? "―(제외)" : w[a]}`);
      console.log(`[각주 — 발언유형: ${st}] ${parts.join(" · ")}`);
    }
    console.log(
      "(§4 발언유형별 가중치표 참조. 가중평균 = Σ(축점수×가중치) / Σ(적용가중치). \"향후 발언평가내용\"은 이전 회기 참조 근거가 없어 지속성 축을 유보한 것)"
    );
    console.log("```");
  }

  console.log("\n---\n");
  for (const [, block] of memberDetail) {
    console.log(block);
    console.log("---\n");
  }
}

main().then(() => process.exit(0));
