// mobile/src/components/table1/ScoreGridTab.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import type { InsightRow } from "@/lib/api";
import { AXES, AXIS_LABELS, axisCellLabel } from "@/lib/axes";
import { colors, typography, spacing, radius } from "@/theme/tokens";

const ROW_HEIGHT = 44;
const SCORE_COLUMN_WIDTH = 64;

export function ScoreGridTab({ rows, footnote }: { rows: InsightRow[]; footnote: string }) {
  const sorted = [...rows].sort((a, b) => b.weightedScore - a.weightedScore);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.tableRow}>
        <View style={styles.stickyColumn}>
          <View style={[styles.cell, styles.headerCell, styles.memberCell]}>
            <Text style={styles.headerLabel}>의원</Text>
          </View>
          {sorted.map((row) => (
            <Pressable
              key={row.statementId}
              style={[styles.cell, styles.memberCell]}
              onPress={() => router.push(`/statement/${row.statementId}`)}
            >
              <Text style={styles.memberLabel}>{row.memberName}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.grid}>
          <View>
            <View style={styles.dataRow}>
              {AXES.map((axis) => (
                <View key={axis} style={[styles.cell, styles.scoreCell, styles.headerCell]}>
                  <Text style={styles.headerLabel}>{AXIS_LABELS[axis]}</Text>
                </View>
              ))}
            </View>
            {sorted.map((row) => (
              <View key={row.statementId} style={styles.dataRow}>
                {AXES.map((axis) => (
                  <View key={axis} style={[styles.cell, styles.scoreCell]}>
                    <Text
                      style={
                        axis === "persistence" && row.persistenceStatus === "pending_future_evaluation"
                          ? styles.pendingBadge
                          : styles.scoreLabel
                      }
                    >
                      {axisCellLabel(row[axis], axis, row.persistenceStatus)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <Text style={styles.footnote}>{footnote}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: spacing[12] },
  tableRow: { flexDirection: "row" },
  stickyColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.line.solid,
  },
  grid: { flexGrow: 0 },
  dataRow: { flexDirection: "row" },
  cell: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
    paddingHorizontal: spacing[6],
  },
  headerCell: { backgroundColor: colors.background.alternative },
  memberCell: { width: 88, alignItems: "flex-start" },
  scoreCell: { width: SCORE_COLUMN_WIDTH },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal },
  scoreLabel: { ...typography.body2, color: colors.label.normal },
  pendingBadge: {
    ...typography.caption2,
    color: colors.label.alternative,
    backgroundColor: colors.fill.normal,
    borderRadius: radius[6],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    overflow: "hidden",
  },
  footnote: { ...typography.caption2, color: colors.label.alternative, marginTop: spacing[12] },
});
