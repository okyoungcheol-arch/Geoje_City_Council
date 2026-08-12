// mobile/src/app/statement/[id].tsx
import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ScrollView, Text, View, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { fetchInsightWithSiblings, type InsightRow } from "@/lib/api";
import { KPIS, KPI_LABELS, kpiCellLabel } from "@/lib/kpis";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export default function StatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<InsightRow | null | undefined>(undefined);
  const [siblings, setSiblings] = useState<InsightRow[]>([]);

  useEffect(() => {
    fetchInsightWithSiblings(Number(id)).then((result) => {
      setRow(result?.row ?? null);
      setSiblings(result?.siblings ?? []);
    });
  }, [id]);

  if (row === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (row === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>발언을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.meeting}>{row.meetingTitle}</Text>
      <Text style={styles.member}>{row.memberName}</Text>

      <View style={styles.scoreGrid}>
        {KPIS.map((kpi) => (
          <View key={kpi} style={styles.scoreGridItem}>
            <Text style={styles.scoreGridLabel}>{KPI_LABELS[kpi]}</Text>
            <Text style={styles.scoreGridValue}>{kpiCellLabel(row, kpi)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>연결된 향후 감시 주제</Text>
      {row.topicsToWatch.length > 0 ? (
        row.topicsToWatch.map((t) => (
          <Text key={t} style={styles.body}>
            · {t}
          </Text>
        ))
      ) : (
        <Text style={styles.body}>없음</Text>
      )}

      <Text style={styles.sectionTitle}>인용 근거</Text>
      {row.citations.length > 0 ? (
        row.citations.map((c, i) => (
          <Text key={i} style={styles.body}>
            [{c.type}] {c.text}
          </Text>
        ))
      ) : (
        <Text style={styles.body}>없음</Text>
      )}

      {row.proposals.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>제안 요소 체크</Text>
          {row.proposals.map((p, i) => (
            <Text key={i} style={styles.body}>
              제안 {i + 1}: 예산{p.budget ? "✓" : "✗"} 시기{p.timeline ? "✓" : "✗"} 주체
              {p.subject ? "✓" : "✗"} 방법{p.method ? "✓" : "✗"}
            </Text>
          ))}
        </>
      )}

      {row.qaRounds.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>질의응답 왕복</Text>
          {row.qaRounds.map((r) => (
            <Text key={r.roundIndex} style={styles.body}>
              round {r.roundIndex + 1}: {r.answerGrade}
              {r.bonusTags.length > 0 ? ` (${r.bonusTags.join(", ")})` : ""}
            </Text>
          ))}
        </>
      )}

      {row.selfRaisedIssues.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>등록된 이슈</Text>
          {row.selfRaisedIssues.map((issue, i) => (
            <Text key={i} style={styles.body}>
              · {issue.description}
            </Text>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>요약</Text>
      <Text style={styles.body}>{row.summary}</Text>
      <Text style={styles.sectionTitle}>회의록 원문</Text>
      <Text style={styles.body}>{row.rawText}</Text>
      <Text style={styles.sectionTitle}>AI 채점 근거</Text>
      <Text style={styles.body}>{row.rationale}</Text>

      {siblings.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>이 회의의 다른 발언 {siblings.length}건</Text>
          {siblings.map((s) => (
            <Pressable key={s.statementId} style={styles.siblingCard} onPress={() => router.push(`/statement/${s.statementId}`)}>
              <View style={styles.siblingHeaderRow}>
                <Text style={styles.siblingScore}>{kpiCellLabel(s, "evidenceDensity")}</Text>
                <Text style={styles.siblingTopic}>{s.tags[0] ?? s.summary.slice(0, 24)}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[16], backgroundColor: colors.background.normal },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.normal },
  meeting: { ...typography.caption2, color: colors.label.alternative },
  member: { ...typography.title3, color: colors.label.normal, marginBottom: spacing[8] },
  scoreGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8] },
  scoreGridItem: {
    width: "23%",
    backgroundColor: colors.background.alternative,
    borderRadius: radius[8],
    paddingVertical: spacing[6],
    alignItems: "center",
  },
  scoreGridLabel: { ...typography.caption2, color: colors.label.alternative },
  scoreGridValue: { ...typography.label1, color: colors.label.normal, marginTop: spacing[2] },
  sectionTitle: { ...typography.label1, color: colors.label.normal, marginTop: spacing[12], marginBottom: spacing[4] },
  body: { ...typography.body2, color: colors.label.neutral },
  siblingCard: {
    padding: spacing[10],
    borderRadius: radius[8],
    backgroundColor: colors.background.alternative,
    marginBottom: spacing[6],
  },
  siblingHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing[8] },
  siblingScore: { ...typography.label1, color: colors.primary.normal },
  siblingTopic: { ...typography.body2, color: colors.label.neutral, flexShrink: 1 },
});
