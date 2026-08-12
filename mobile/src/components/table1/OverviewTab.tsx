// mobile/src/components/table1/OverviewTab.tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightGroup, type InsightRow } from "@/lib/api";
import { KPIS, KPI_LABELS, kpiCellLabel, meetingSessionTitle, type Kpi } from "@/lib/kpis";
import { colors, typography, spacing, radius } from "@/theme/tokens";

type SortField = "member" | "meeting" | "tags" | Kpi;
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  meeting: "회의",
  tags: "태그",
  ...KPI_LABELS,
};

function isKpiField(field: SortField): field is Kpi {
  return (KPIS as string[]).includes(field);
}

function compareGroups(a: InsightGroup, b: InsightGroup, field: SortField): number {
  if (isKpiField(field)) {
    const av = kpiCellLabel(a.representative, field);
    const bv = kpiCellLabel(b.representative, field);
    // N/A("―")는 항상 최하위로 취급 — 숫자 비교 전에 걸러낸다.
    if (av === "―" && bv === "―") return 0;
    if (av === "―") return -1;
    if (bv === "―") return 1;
    return parseFloat(av) - parseFloat(bv);
  }
  if (field === "member") {
    return a.representative.memberName.localeCompare(b.representative.memberName, "ko");
  }
  if (field === "meeting") {
    return meetingSessionTitle(a.representative.meetingTitle).localeCompare(
      meetingSessionTitle(b.representative.meetingTitle),
      "ko"
    );
  }
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}

export function OverviewTab({ rows }: { rows: InsightRow[] }) {
  const [activeKpi, setActiveKpi] = useState<Kpi>("evidenceDensity");
  const [sort, setSort] = useState<SortState>({ field: "evidenceDensity", direction: "desc" });

  const groups = useMemo(() => {
    const base = groupByMemberMeeting(rows, activeKpi);
    const sorted = [...base].sort((a, b) => compareGroups(a, b, sort.field));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort, activeKpi]);

  function handleHeaderPress(field: SortField) {
    if (isKpiField(field)) setActiveKpi(field);
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "member" || field === "tags" ? "asc" : "desc" }
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
      <Pressable style={[styles.cell, styles.meetingCell]} onPress={() => handleHeaderPress("meeting")}>
        <Text style={styles.headerLabel}>{headerLabel("meeting")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.tagsCell]} onPress={() => handleHeaderPress("tags")}>
        <Text style={styles.headerLabel}>{headerLabel("tags")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress(activeKpi)}>
        <Text style={styles.headerLabel}>{headerLabel(activeKpi)}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.kpiSelectorRow}>
        {KPIS.map((kpi) => (
          <Pressable
            key={kpi}
            style={[styles.kpiChip, activeKpi === kpi && styles.kpiChipActive]}
            onPress={() => handleHeaderPress(kpi)}
          >
            <Text style={[styles.kpiChipLabel, activeKpi === kpi && styles.kpiChipLabelActive]}>{KPI_LABELS[kpi]}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        style={styles.list}
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
              <View style={[styles.cell, styles.meetingCell]}>
                <Text style={styles.meetingLabel} numberOfLines={1}>
                  {meetingSessionTitle(row.meetingTitle)}
                </Text>
              </View>
              <View style={[styles.cell, styles.tagsCell]}>
                <Text style={styles.tagsLabel} numberOfLines={1}>
                  {row.tags.join(", ")}
                </Text>
              </View>
              <View style={[styles.cell, styles.scoreCell]}>
                <Text style={styles.scoreLabel}>{kpiCellLabel(row, activeKpi)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  content: { padding: spacing[12] },
  kpiSelectorRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8], padding: spacing[12] },
  kpiChip: {
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.fill.normal,
  },
  kpiChipActive: { backgroundColor: colors.primary.normal },
  kpiChipLabel: { ...typography.label2, color: colors.label.neutral },
  kpiChipLabelActive: { color: colors.background.normal },
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
  memberCell: { width: 68 },
  meetingCell: { width: 84 },
  tagsCell: { flex: 1 },
  scoreCell: { width: 88, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingLabel: { ...typography.caption1, color: colors.label.neutral },
  tagsLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
});
