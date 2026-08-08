"use client";

import { useMemo, useState } from "react";
import type { InsightRow } from "@/lib/queries/insights";
import { AXES, AXIS_WEIGHTS, type Axis } from "@/lib/scoring/weightedAverage";
import type { SpeechType } from "@/lib/ai/summarize";
import styles from "./table1.module.css";

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

const SPEECH_TYPE_LABELS: Record<string, string> = {
  five_min: "5분 이상 발언",
  budget_review: "예산·결산 심의",
  admin_audit: "행정사무감사",
  ordinance_proposal: "조례 발안 설명",
};

function meetingShortTitle(fullTitle: string): string {
  return fullTitle.split("\n")[0].trim();
}

function weightFootnote(speechTypesUsed: SpeechType[]): string {
  return speechTypesUsed
    .map((st) => {
      const weights = AXIS_WEIGHTS[st];
      const parts = AXES.map((a) => `${AXIS_LABELS[a]} ${weights[a] === null ? "―(제외)" : weights[a]}`);
      return `[${SPEECH_TYPE_LABELS[st] ?? st}] ${parts.join(" · ")}`;
    })
    .join("\n");
}

function cellValue(row: InsightRow, axis: Axis): string {
  if (axis === "persistence" && row.persistenceStatus === "pending_future_evaluation") return "향후평가";
  const v = row[axis];
  return v === null || v === undefined ? "―" : String(v);
}

export function Table1Client({ rows }: { rows: InsightRow[] }) {
  const meetings = useMemo(() => {
    const map = new Map<string, InsightRow[]>();
    for (const r of rows) {
      const key = r.meetingTitle;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  const [selectedMeeting, setSelectedMeeting] = useState(meetings[0]?.[0] ?? "");
  const [tab, setTab] = useState<"overview" | "scores">("overview");
  const [modalMember, setModalMember] = useState<InsightRow | null>(null);

  const meetingRows = meetings.find(([title]) => title === selectedMeeting)?.[1] ?? [];
  const sorted = [...meetingRows].sort((a, b) => b.weightedScore - a.weightedScore);
  const speechTypesUsed = [...new Set(meetingRows.map((r) => r.speechType as SpeechType))];

  if (rows.length === 0) {
    return (
      <main className={styles.screen}>
        <p className={styles.disclaimer}>표시할 채점 데이터가 없습니다 (statement_insights가 비어 있음).</p>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <h1>표1. {meetingShortTitle(selectedMeeting)}</h1>
        <p className={styles.disclaimer}>
          실제 채점 데이터입니다. 5.3절 고지문 참조 — ⑤ 견제력 1점은 &ldquo;청렴하지 않음&rdquo;이 아니라 &ldquo;이번 발언이 감시
          사안을 다루지 않았음&rdquo;을, ④ 지속성 &ldquo;향후평가&rdquo;는 이전 회기 데이터가 없어 판단을 유보한 것을 의미합니다.
        </p>
        <select
          className={styles.meetingSelect}
          value={selectedMeeting}
          onChange={(e) => setSelectedMeeting(e.target.value)}
        >
          {meetings.map(([title, mRows]) => (
            <option key={title} value={title}>
              {meetingShortTitle(title)} ({mRows.length}건)
            </option>
          ))}
        </select>
      </header>

      <nav className={styles.tabbar}>
        <button
          className={tab === "overview" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
          onClick={() => setTab("overview")}
        >
          개요
        </button>
        <button
          className={tab === "scores" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
          onClick={() => setTab("scores")}
        >
          축별 점수
        </button>
      </nav>

      {tab === "overview" ? (
        <section>
          {sorted.map((row) => (
            <div
              key={row.statementId}
              className={styles.overviewCard}
              onClick={() => setModalMember(row)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.overviewCardHead}>
                <span className={styles.overviewMember}>{row.memberName}</span>
                <span className={styles.overviewScore}>{row.weightedScore.toFixed(2)}</span>
              </div>
              <p className={styles.overviewTopic}>{row.tags[0] ?? row.summary.slice(0, 24)}</p>
              <div>
                {row.tags.map((t) => (
                  <span key={t} className={styles.tagChip}>
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section>
          <div className={styles.scoreTableWrap}>
            <table className={styles.scoreTable}>
              <thead>
                <tr>
                  <th className={styles.memberCell}>의원</th>
                  {AXES.map((a) => (
                    <th key={a}>{AXIS_LABELS[a]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.statementId}>
                    <td className={styles.memberCell} onClick={() => setModalMember(row)}>
                      {row.memberName}
                    </td>
                    {AXES.map((a) => (
                      <td key={a}>
                        {a === "persistence" && row.persistenceStatus === "pending_future_evaluation" ? (
                          <span className={styles.pendingBadge}>향후평가</span>
                        ) : (
                          cellValue(row, a)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className={styles.footnote}>{weightFootnote(speechTypesUsed)}</pre>
        </section>
      )}

      {modalMember && (
        <div className={styles.modalOverlay} onClick={() => setModalMember(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setModalMember(null)} aria-label="닫기">
              ×
            </button>
            <h2>표2. {modalMember.memberName}</h2>
            <span className={styles.scoreBadge}>가중평균 {modalMember.weightedScore.toFixed(2)}</span>
            <section>
              <h3>발언 요약</h3>
              <p>{modalMember.summary}</p>
            </section>
            <section>
              <h3>채점 근거</h3>
              <p>{modalMember.rationale}</p>
            </section>
            <section>
              <h3>연결된 향후 감시 주제</h3>
              {modalMember.topicsToWatch.length > 0 ? (
                modalMember.topicsToWatch.map((t) => <p key={t}>· {t}</p>)
              ) : (
                <p>없음</p>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
