// mobile/src/components/table1/ScoreGridTab.tsx
import { useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightRow } from "@/lib/api";
import { AXES, AXIS_LABELS, axisCellLabel, meetingSessionTitle } from "@/lib/axes";
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

  // 헤더의 축 컬럼(창의성/실현가능성/...)은 자체적으로 스크롤하지 않는다 — 아래 본문
  // grid를 가로로 스크롤하면 onScroll에서 이 ref로 같은 x 오프셋을 그대로 흘려보내
  // 헤더가 본문과 함께 움직이는 것처럼 보이게 한다. 헤더 쪽에서 반대로 흘려보낼 필요가
  // 없으므로(scrollEnabled=false) 두 ScrollView가 서로의 스크롤을 되먹임하는 문제가 없다.
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
            {DISPLAY_AXES.map((axis) => (
              <View key={axis} style={[styles.cell, styles.scoreCell, styles.headerCell]}>
                <Text style={styles.headerLabel}>{AXIS_LABELS[axis]}</Text>
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
  headerCell: { backgroundColor: colors.background.alternative },
  memberCell: { width: 88, alignItems: "flex-start" },
  meetingCell: { width: 132, alignItems: "flex-start" },
  scoreCell: { width: SCORE_COLUMN_WIDTH },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal },
  meetingLabel: { ...typography.caption1, color: colors.label.neutral },
  scoreLabel: { ...typography.body2, color: colors.label.normal },
  footnote: { ...typography.caption2, color: colors.label.alternative, marginTop: spacing[12] },
});
