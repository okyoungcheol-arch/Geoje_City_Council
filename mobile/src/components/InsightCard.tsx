// mobile/src/components/InsightCard.tsx
import { View, Text, StyleSheet } from "react-native";
import type { InsightRow } from "@/lib/api";
import { TagChip } from "./TagChip";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export function InsightCard({ row }: { row: InsightRow }) {
  return (
    <View style={styles.card}>
      <Text style={styles.meeting}>{row.meetingTitle}</Text>
      <Text style={styles.member}>{row.memberName}</Text>
      <View style={styles.tagRow}>
        {row.tags.map((tag) => (
          <TagChip key={tag} tag={tag} statementId={row.statementId} />
        ))}
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.score}>학습 {row.learningLevel}</Text>
        <Text style={styles.score}>질의 {row.questionScore}</Text>
        <Text style={styles.score}>아이디어 {row.ideaScore}</Text>
        <Text style={styles.score}>실행 {row.feasibilityScore}</Text>
        <Text style={styles.score}>거제영향 {row.geojeImpactScore}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[12],
    borderRadius: radius[8],
    backgroundColor: colors.background.normal,
    marginBottom: spacing[10],
    borderWidth: 1,
    borderColor: colors.line.solid,
  },
  meeting: { ...typography.caption2, color: colors.label.alternative },
  member: { ...typography.headline2, color: colors.label.normal, marginVertical: spacing[2] },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginVertical: spacing[4] },
  scoreRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8] },
  score: { ...typography.caption1, color: colors.label.neutral },
});
