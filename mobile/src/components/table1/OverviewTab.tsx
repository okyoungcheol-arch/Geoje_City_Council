// mobile/src/components/table1/OverviewTab.tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightGroup, type InsightRow } from "@/lib/api";
import { colors, typography, spacing } from "@/theme/tokens";

type SortField = "member" | "tags" | "score";
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  tags: "태그",
  score: "평가점수",
};

function compareGroups(a: InsightGroup, b: InsightGroup, field: SortField): number {
  if (field === "score") {
    return a.representative.weightedScore - b.representative.weightedScore;
  }
  if (field === "member") {
    return a.representative.memberName.localeCompare(b.representative.memberName, "ko");
  }
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}

function defaultDirectionFor(field: SortField): SortDirection {
  return field === "score" ? "desc" : "asc";
}

export function OverviewTab({ rows }: { rows: InsightRow[] }) {
  const [sort, setSort] = useState<SortState>({ field: "score", direction: "desc" });

  const groups = useMemo(() => {
    const base = groupByMemberMeeting(rows);
    const sorted = [...base].sort((a, b) => compareGroups(a, b, sort.field));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort]);

  function handleHeaderPress(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: defaultDirectionFor(field) }
    );
  }

  function headerLabel(field: SortField) {
    if (sort.field !== field) return HEADER_LABELS[field];
    return `${HEADER_LABELS[field]} ${sort.direction === "asc" ? "▲" : "▼"}`;
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={[styles.cell, styles.memberCell]} onPress={() => handleHeaderPress("member")}>
        <Text style={styles.headerLabel}>{headerLabel("member")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.tagsCell]} onPress={() => handleHeaderPress("tags")}>
        <Text style={styles.headerLabel}>{headerLabel("tags")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress("score")}>
        <Text style={styles.headerLabel}>{headerLabel("score")}</Text>
      </Pressable>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={(group) => String(group.representative.statementId)}
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      renderItem={({ item }) => {
        const row = item.representative;
        return (
          <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${row.statementId}`)}>
            <View style={[styles.cell, styles.memberCell]}>
              <Text style={styles.memberLabel}>{row.memberName}</Text>
            </View>
            <View style={[styles.cell, styles.tagsCell]}>
              <Text style={styles.tagsLabel} numberOfLines={1}>
                {row.tags.join(", ")}
              </Text>
            </View>
            <View style={[styles.cell, styles.scoreCell]}>
              <Text style={styles.scoreLabel}>{row.weightedScore.toFixed(2)}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing[12] },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.background.alternative,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  cell: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
  },
  memberCell: { width: 96 },
  tagsCell: { flex: 1 },
  scoreCell: { width: 72, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.label.normal },
  tagsLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
});
