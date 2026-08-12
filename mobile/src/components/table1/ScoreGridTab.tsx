// mobile/src/components/table1/ScoreGridTab.tsx
import { useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightRow } from "@/lib/api";
import { KPIS, KPI_LABELS, kpiCellLabel, meetingSessionTitle } from "@/lib/kpis";
import { colors, typography, spacing } from "@/theme/tokens";

const ROW_HEIGHT = 44;
const HEADER_ROW_HEIGHT = 44;
const SCORE_COLUMN_WIDTH = 84;

export function ScoreGridTab({ rows }: { rows: InsightRow[] }) {
  const groups = groupByMemberMeeting(rows, "evidenceDensity").sort(
    (a, b) => (b.representative.kpiEvidenceDensity ?? -Infinity) - (a.representative.kpiEvidenceDensity ?? -Infinity)
  );

  const headerGridScrollRef = useRef<ScrollView>(null);

  function handleBodyGridScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    headerGridScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.stickyColumn}>
          <View style={styles.dataRow}>
            <View style={[styles.cell, styles.headerCell, styles.memberCell]}>
              <Text style={styles.headerLabel}>의원</Text>
            </View>
            <View style={[styles.cell, styles.headerCell, styles.meetingCell]}>
              <Text style={styles.headerLabel}>회의</Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          ref={headerGridScrollRef}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={styles.grid}
        >
          <View style={styles.dataRow}>
            {KPIS.map((kpi) => (
              <View key={kpi} style={[styles.cell, styles.scoreCell, styles.headerCell]}>
                <Text style={styles.headerLabel}>{KPI_LABELS[kpi]}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.tableRow}>
          <View style={styles.stickyColumn}>
            {groups.map((group) => (
              <Pressable
                key={group.representative.statementId}
                style={styles.dataRow}
                onPress={() => router.push(`/statement/${group.representative.statementId}`)}
              >
                <View style={[styles.cell, styles.memberCell]}>
                  <Text style={styles.memberLabel}>{group.representative.memberName}</Text>
                </View>
                <View style={[styles.cell, styles.meetingCell]}>
                  <Text style={styles.meetingLabel} numberOfLines={1}>
                    {meetingSessionTitle(group.representative.meetingTitle)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            onScroll={handleBodyGridScroll}
            scrollEventThrottle={16}
            style={styles.grid}
          >
            <View>
              {groups.map((group) => (
                <View key={group.representative.statementId} style={styles.dataRow}>
                  {KPIS.map((kpi) => (
                    <View key={kpi} style={[styles.cell, styles.scoreCell]}>
                      <Text style={styles.scoreLabel}>{kpiCellLabel(group.representative, kpi)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    paddingHorizontal: spacing[12],
    paddingTop: spacing[12],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
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
  headerCell: { backgroundColor: colors.background.alternative, height: HEADER_ROW_HEIGHT },
  memberCell: { width: 88, alignItems: "flex-start" },
  meetingCell: { width: 132, alignItems: "flex-start" },
  scoreCell: { width: SCORE_COLUMN_WIDTH },
  headerLabel: { ...typography.label2, color: colors.label.alternative, textAlign: "center" },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingLabel: { ...typography.caption1, color: colors.label.neutral },
  scoreLabel: { ...typography.body2, color: colors.label.normal },
});
