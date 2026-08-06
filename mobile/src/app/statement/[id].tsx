// mobile/src/app/statement/[id].tsx
import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View, ActivityIndicator, StyleSheet } from "react-native";
import { fetchInsightById, type InsightRow } from "@/lib/api";
import { colors, typography, spacing } from "@/theme/tokens";

export default function StatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<InsightRow | null | undefined>(undefined);

  useEffect(() => {
    fetchInsightById(Number(id)).then(setRow);
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
      <Text style={styles.sectionTitle}>요약</Text>
      <Text style={styles.body}>{row.summary}</Text>
      <Text style={styles.sectionTitle}>회의록 원문</Text>
      <Text style={styles.body}>{row.rawText}</Text>
      <Text style={styles.sectionTitle}>AI 채점 근거</Text>
      <Text style={styles.body}>{row.rationale}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[16], backgroundColor: colors.background.normal },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.normal },
  meeting: { ...typography.caption2, color: colors.label.alternative },
  member: { ...typography.title3, color: colors.label.normal, marginBottom: spacing[12] },
  sectionTitle: { ...typography.label1, color: colors.label.normal, marginTop: spacing[12], marginBottom: spacing[4] },
  body: { ...typography.body2, color: colors.label.neutral },
});
