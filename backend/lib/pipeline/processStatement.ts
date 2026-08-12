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

    // docs/rubric/CLAUDE.md §3① — 사전준비도 분모는 발언 어절수. 의례적 인사말을 완전히 걸러내진
    // 못하는 알려진 근사이지만, 공백 분리 어절수는 rawText만으로 항상 계산 가능하다.
    const trimmed = stmt.rawText.trim();
    const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).filter(Boolean).length : null;
    const evidenceDensity = computeEvidenceDensity(citations, wordCount);
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
