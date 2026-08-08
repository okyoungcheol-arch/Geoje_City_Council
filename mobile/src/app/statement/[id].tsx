// mobile/src/app/statement/[id].tsx
import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ScrollView, Text, View, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { fetchInsightWithSiblings, type InsightRow } from "@/lib/api";
import { AXES, AXIS_LABELS, axisCellLabel } from "@/lib/axes";
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

      <View style={styles.scoreBadge}>
        <Text style={styles.scoreBadgeLabel}>가중평균 {row.weightedScore.toFixed(2)}</Text>
      </View>

      <View style={styles.scoreGrid}>
        {AXES.map((axis) => (
          <View key={axis} style={styles.scoreGridItem}>
            <Text style={styles.scoreGridLabel}>{AXIS_LABELS[axis]}</Text>
            <Text style={styles.scoreGridValue}>{axisCellLabel(row[axis], axis, row.persistenceStatus)}</Text>
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
                <Text style={styles.siblingScore}>{s.weightedScore.toFixed(2)}</Text>
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
  scoreBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.fill.normal,
    borderRadius: radius[8],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    marginBottom: spacing[12],
  },
  scoreBadgeLabel: { ...typography.label1, color: colors.primary.normal },
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
