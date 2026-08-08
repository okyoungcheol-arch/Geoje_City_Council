// mobile/src/components/table1/OverviewTab.tsx
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import type { InsightRow } from "@/lib/api";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export function OverviewTab({ rows }: { rows: InsightRow[] }) {
  const sorted = [...rows].sort((a, b) => b.weightedScore - a.weightedScore);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={sorted}
      keyExtractor={(row) => String(row.statementId)}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/statement/${item.statementId}`)}>
          <View style={styles.headerRow}>
            <Text style={styles.member}>{item.memberName}</Text>
            <Text style={styles.weightedScore}>{item.weightedScore.toFixed(2)}</Text>
          </View>
          <Text style={styles.topic}>{item.tags[0] ?? item.summary.slice(0, 24)}</Text>
          <View style={styles.tagRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagLabel}>{tag}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing[12] },
  card: {
    padding: spacing[12],
    borderRadius: radius[8],
    backgroundColor: colors.background.normal,
    marginBottom: spacing[10],
    borderWidth: 1,
    borderColor: colors.line.solid,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  member: { ...typography.headline1, color: colors.label.normal },
  weightedScore: { ...typography.headline1, color: colors.primary.normal },
  topic: { ...typography.body2, color: colors.label.neutral, marginTop: spacing[2] },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing[8] },
  tagChip: {
    backgroundColor: colors.fill.normal,
    borderRadius: radius[16],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    marginRight: spacing[6],
    marginBottom: spacing[6],
  },
  tagLabel: { ...typography.caption1, color: colors.primary.normal },
});
