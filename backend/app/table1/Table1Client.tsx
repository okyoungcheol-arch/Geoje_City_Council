"use client";

import { useMemo, useState } from "react";
import type { InsightRow } from "@/lib/queries/insights";
import styles from "./table1.module.css";

type Kpi = "kpiEvidenceDensity" | "kpiSolutionSpecificity" | "kpiInterrogationDepth" | "kpiCommitmentRate";

const KPIS: Kpi[] = ["kpiEvidenceDensity", "kpiSolutionSpecificity", "kpiInterrogationDepth", "kpiCommitmentRate"];

const KPI_LABELS: Record<Kpi, string> = {
  kpiEvidenceDensity: "사전준비도",
  kpiSolutionSpecificity: "정책생산력",
  kpiInterrogationDepth: "실시간 압박력",
  kpiCommitmentRate: "성과전환력",
};

function meetingShortTitle(fullTitle: string): string {
  return fullTitle.split("\n")[0].trim();
}

function kpiCellLabel(row: InsightRow, kpi: Kpi): string {
  const value = row[kpi];
  if (value === null) return "―";
  if (kpi === "kpiCommitmentRate") return `${Math.round(value * 100)}%`;
  if (kpi === "kpiEvidenceDensity") return `${value.toFixed(2)}${row.kpiEvidenceDensityGrade ? `(${row.kpiEvidenceDensityGrade})` : ""}`;
  return value.toFixed(2);
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
  const [activeKpi, setActiveKpi] = useState<Kpi>("kpiEvidenceDensity");

  const meetingRows = meetings.find(([title]) => title === selectedMeeting)?.[1] ?? [];
  const sorted = [...meetingRows].sort((a, b) => (b[activeKpi] ?? -Infinity) - (a[activeKpi] ?? -Infinity));

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
          실제 채점 데이터입니다. 5개 KPI는 회의록 텍스트에서 재현 가능한 규칙으로 계산되며, 값이 없는
          &ldquo;―&rdquo;는 해당 발언에 그 KPI를 계산할 근거(질의응답 구조, 제안 등)가 없었음을 의미합니다.
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

      <div className={styles.tabbar} style={{ marginTop: 4 }}>
        {KPIS.map((kpi) => (
          <button
            key={kpi}
            className={activeKpi === kpi ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
            onClick={() => setActiveKpi(kpi)}
          >
            {KPI_LABELS[kpi]}
          </button>
        ))}
      </div>

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
                <span className={styles.overviewScore}>{kpiCellLabel(row, activeKpi)}</span>
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
                  {KPIS.map((kpi) => (
                    <th key={kpi}>{KPI_LABELS[kpi]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.statementId}>
                    <td className={styles.memberCell} onClick={() => setModalMember(row)}>
                      {row.memberName}
                    </td>
                    {KPIS.map((kpi) => (
                      <td key={kpi}>{kpiCellLabel(row, kpi)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modalMember && (
        <div className={styles.modalOverlay} onClick={() => setModalMember(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setModalMember(null)} aria-label="닫기">
              ×
            </button>
            <h2>표2. {modalMember.memberName}</h2>
            <div className={styles.scoreTableWrap}>
              {KPIS.map((kpi) => (
                <span key={kpi} className={styles.scoreBadge} style={{ marginRight: 8 }}>
                  {KPI_LABELS[kpi]} {kpiCellLabel(modalMember, kpi)}
                </span>
              ))}
            </div>
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
