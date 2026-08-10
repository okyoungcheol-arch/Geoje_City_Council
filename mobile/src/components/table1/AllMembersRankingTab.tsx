// mobile/src/components/table1/AllMembersRankingTab.tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import {
  groupByMember,
  fetchIssuePersistence,
  type InsightMemberGroup,
  type InsightRow,
  type MemberIssuePersistence,
} from "@/lib/api";
import { KPIS, KPI_LABELS, type Kpi } from "@/lib/kpis";
import { colors, typography, spacing, radius } from "@/theme/tokens";

type SortField = "member" | "meetingCount" | "tags" | Kpi;
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  meetingCount: "참여회의수",
  tags: "태그",
  ...KPI_LABELS,
};

function isKpiField(field: SortField): field is Kpi {
  return (KPIS as string[]).includes(field);
}

function compareGroups(a: InsightMemberGroup, b: InsightMemberGroup, field: SortField): number {
  if (isKpiField(field)) {
    return (a.kpiAverages[field] ?? -Infinity) - (b.kpiAverages[field] ?? -Infinity);
  }
  if (field === "meetingCount") return a.meetingCount - b.meetingCount;
  if (field === "member") return a.memberName.localeCompare(b.memberName, "ko");
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}

export function AllMembersRankingTab({ rows }: { rows: InsightRow[] }) {
  const [activeKpi, setActiveKpi] = useState<Kpi>("evidenceDensity");
  const [sort, setSort] = useState<SortState>({ field: "evidenceDensity", direction: "desc" });
  const [issuePersistence, setIssuePersistence] = useState<Map<string, MemberIssuePersistence>>(new Map());

  useEffect(() => {
    fetchIssuePersistence().then((list) => setIssuePersistence(new Map(list.map((p) => [p.memberName, p]))));
  }, []);

  const groups = useMemo(() => {
    const base = groupByMember(rows, activeKpi);
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

  function issuePersistenceLabel(memberName: string): string {
    const p = issuePersistence.get(memberName);
    if (!p) return "―";
    if (p.status === "tracking") return "추적 중";
    return `${Math.round((p.rate ?? 0) * 100)}%(${p.grade})`;
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={[styles.cell, styles.memberCell]} onPress={() => handleHeaderPress("member")}>
        <Text style={styles.headerLabel}>{headerLabel("member")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.meetingCountCell]} onPress={() => handleHeaderPress("meetingCount")}>
        <Text style={styles.headerLabel}>{headerLabel("meetingCount")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress(activeKpi)}>
        <Text style={styles.headerLabel}>{headerLabel(activeKpi)}</Text>
      </Pressable>
      <View style={[styles.cell, styles.issueCell]}>
        <Text style={styles.headerLabel}>이슈지속추적률</Text>
      </View>
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
        keyExtractor={(group) => group.memberName}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        renderItem={({ item }) => {
          const row = item.representative;
          return (
            <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${row.statementId}`)}>
              <View style={[styles.cell, styles.memberCell]}>
                <Text style={styles.memberLabel}>{item.memberName}</Text>
              </View>
              <View style={[styles.cell, styles.meetingCountCell]}>
                <Text style={styles.meetingCountLabel}>{item.meetingCount}회</Text>
              </View>
              <View style={[styles.cell, styles.scoreCell]}>
                <Text style={styles.scoreLabel}>{item.kpiAverages[activeKpi]?.toFixed(2) ?? "―"}</Text>
              </View>
              <View style={[styles.cell, styles.issueCell]}>
                <Text style={styles.issueLabel}>{issuePersistenceLabel(item.memberName)}</Text>
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
  kpiChip: { paddingHorizontal: spacing[10], paddingVertical: spacing[6], borderRadius: radius.full, backgroundColor: colors.fill.normal },
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
  meetingCountCell: { width: 76, alignItems: "flex-end" },
  scoreCell: { width: 88, alignItems: "flex-end" },
  issueCell: { width: 96, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingCountLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
  issueLabel: { ...typography.body2, color: colors.label.neutral },
});
