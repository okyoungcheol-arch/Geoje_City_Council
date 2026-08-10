import type { Citation, Proposal } from "@/lib/ai/summarize";
import type { QaRound } from "@/lib/ai/extractQaRounds";

export type Grade = "A" | "B" | "C" | "D";

function densityGrade(value: number): Grade {
  if (value >= 3.0) return "A";
  if (value >= 2.0) return "B";
  if (value >= 1.0) return "C";
  return "D";
}

/** docs/rubric/CLAUDE.md §3① — 발언시간이 없으면 근사하지 않고 N/A. */
export function computeEvidenceDensity(
  citations: Citation[],
  speechDurationSec: number | null
): { value: number | null; grade: Grade | null } {
  if (speechDurationSec === null || speechDurationSec === 0) return { value: null, grade: null };
  const value = (citations.length / speechDurationSec) * 100;
  return { value: Math.round(value * 100) / 100, grade: densityGrade(value) };
}

/** docs/rubric/CLAUDE.md §3② — 제안 0건이면 N/A(0점 아님). */
export function computeSolutionSpecificity(proposals: Proposal[]): number | null {
  if (proposals.length === 0) return null;
  const total = proposals.reduce(
    (sum, p) => sum + Number(p.budget) + Number(p.timeline) + Number(p.subject) + Number(p.method),
    0
  );
  return Math.round((total / proposals.length) * 100) / 100;
}

const BONUS_TAG_WEIGHT: Record<string, number> = {
  모순포착: 1.0,
  패턴제시: 1.0,
  회피차단: 0.5,
  법근거제시: 0.5,
};

/** docs/rubric/CLAUDE.md §3③ — 질의응답 구조 없으면(rounds 빈 배열) N/A. */
export function computeInterrogationDepth(qaRounds: QaRound[]): { value: number; reQuestionRate: number } | null {
  if (qaRounds.length === 0) return null;
  const bonus = qaRounds.reduce(
    (sum, r) => sum + r.bonusTags.reduce((s, tag) => s + (BONUS_TAG_WEIGHT[tag] ?? 0), 0),
    0
  );
  const reQuestioned = Math.max(qaRounds.length - 1, 0); // round 0 is the initial question; rounds after it are re-questions
  return {
    value: Math.round((qaRounds.length + bonus) * 100) / 100,
    reQuestionRate: Math.round(reQuestioned * 100) / 100,
  };
}

const ANSWER_GRADE_SCORE: Record<QaRound["answerGrade"], number> = {
  확답: 1.0,
  조건부: 0.5,
  회피: 0,
};

/** docs/rubric/CLAUDE.md §3④ — 질의응답 구조 없으면 N/A. */
export function computeCommitmentRate(qaRounds: QaRound[]): number | null {
  if (qaRounds.length === 0) return null;
  const total = qaRounds.reduce((sum, r) => sum + ANSWER_GRADE_SCORE[r.answerGrade], 0);
  return Math.round((total / qaRounds.length) * 100) / 100;
}

/** docs/rubric/CLAUDE.md §3⑤ 등급 경계값. */
export function computeIssuePersistenceGrade(rate: number): Grade {
  if (rate >= 0.6) return "A";
  if (rate >= 0.4) return "B";
  if (rate >= 0.2) return "C";
  return "D";
}
