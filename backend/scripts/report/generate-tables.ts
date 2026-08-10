// Renders CLAUDE.md §6.2 (표1: 회의 단위 평가표) and §6.3 (표2: 의원별 발언 요약) from the
// live statement_insights data. One 표1 is emitted per meeting that has at least one
// scored (non-excluded) statement, followed by a 표2 section per distinct member across
// all such meetings.
import { db } from "@/db/client";
import { statements, statementInsights, members, meetings } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

function cell(v: number | null): string {
  return v === null ? "―" : String(v);
}

function commitmentCell(v: number | null): string {
  return v === null ? "―" : `${Math.round(v * 100)}%`;
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
      hasQaStructure: statementInsights.hasQaStructure,
      kpiEvidenceDensity: statementInsights.kpiEvidenceDensity,
      kpiEvidenceDensityGrade: statementInsights.kpiEvidenceDensityGrade,
      kpiSolutionSpecificity: statementInsights.kpiSolutionSpecificity,
      kpiInterrogationDepth: statementInsights.kpiInterrogationDepth,
      kpiCommitmentRate: statementInsights.kpiCommitmentRate,
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
    console.log("| 의원 | 주제 | 태그(주요발언) | 향후 감시할 주제 | 근거밀도 | 대안구체성 | 추궁심도 | 답변확보율 |");
    console.log("|---|---|---|---|:--:|:--:|:--:|:--:|");

    for (const r of meetingRows) {
      const topic = r.tags?.[0] ?? r.summary.slice(0, 20);
      const tagCells = (r.tags ?? []).map((t) => `\`#${t}\``).join(" ");
      const watchCell = (r.topicsToWatch ?? []).join("; ") || "―";
      const anchor = `#${encodeURIComponent(r.memberName)}`;
      const evidenceDensityCell =
        r.kpiEvidenceDensity === null
          ? "―"
          : `${Number(r.kpiEvidenceDensity).toFixed(2)}${r.kpiEvidenceDensityGrade ? `(${r.kpiEvidenceDensityGrade})` : ""}`;
      const row = [
        `[${r.memberName}](${anchor})`,
        topic,
        tagCells,
        watchCell,
        evidenceDensityCell,
        cell(r.kpiSolutionSpecificity === null ? null : Number(r.kpiSolutionSpecificity)),
        cell(r.kpiInterrogationDepth === null ? null : Number(r.kpiInterrogationDepth)),
        commitmentCell(r.kpiCommitmentRate === null ? null : Number(r.kpiCommitmentRate)),
      ];
      console.log(`| ${row.join(" | ")} |`);

      memberDetail.set(
        r.memberName,
        `### 표2. ${r.memberName}\n\n**발언 요약**: ${r.summary}\n\n**태그**: ${(r.tags ?? [])
          .map((t) => `#${t}`)
          .join(" ")}\n\n**향후 감시 주제**: ${(r.topicsToWatch ?? []).join("; ") || "없음"}\n\n**채점 근거**: ${r.rationale}\n`
      );
    }
  }

  console.log("\n---\n");
  for (const [, block] of memberDetail) {
    console.log(block);
    console.log("---\n");
  }
}

main().then(() => process.exit(0));
