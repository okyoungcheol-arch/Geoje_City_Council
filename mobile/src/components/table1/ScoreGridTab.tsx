// mobile/src/components/table1/ScoreGridTab.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightRow } from "@/lib/api";
import { AXES, AXIS_LABELS, axisCellLabel } from "@/lib/axes";
import { colors, typography, spacing } from "@/theme/tokens";

const ROW_HEIGHT = 44;
const SCORE_COLUMN_WIDTH = 64;

// 지속성은 다회기 데이터가 쌓이기 전까지 항상 "향후평가"만 표시돼 이 화면에서는 뺀다
// (요청: 사용자 화면 피드백). statement/[id].tsx의 표2 상세에는 그대로 남겨둔다.
const DISPLAY_AXES = AXES.filter((axis) => axis !== "persistence");

export function ScoreGridTab({ rows, footnote }: { rows: InsightRow[]; footnote: string }) {
  const groups = groupByMemberMeeting(rows).sort(
    (a, b) => b.representative.weightedScore - a.representative.weightedScore
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.tableRow}>
        <View style={styles.stickyColumn}>
          <View style={[styles.cell, styles.headerCell, styles.memberCell]}>
            <Text style={styles.headerLabel}>의원</Text>
          </View>
          {groups.map((group) => (
            <Pressable
              key={group.representative.statementId}
              style={[styles.cell, styles.memberCell]}
              onPress={() => router.push(`/statement/${group.representative.statementId}`)}
            >
              <Text style={styles.memberLabel}>{group.representative.memberName}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.grid}>
          <View>
            <View style={styles.dataRow}>
              {DISPLAY_AXES.map((axis) => (
                <View key={axis} style={[styles.cell, styles.scoreCell, styles.headerCell]}>
                  <Text style={styles.headerLabel}>{AXIS_LABELS[axis]}</Text>
                </View>
              ))}
            </View>
            {groups.map((group) => (
              <View key={group.representative.statementId} style={styles.dataRow}>
                {DISPLAY_AXES.map((axis) => (
                  <View key={axis} style={[styles.cell, styles.scoreCell]}>
                    <Text style={styles.scoreLabel}>
                      {axisCellLabel(group.representative[axis], axis, group.representative.persistenceStatus)}
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
  footnote: { ...typography.caption2, color: colors.label.alternative, marginTop: spacing[12] },
});
