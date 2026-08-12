// mobile/src/app/index.tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightFilters } from "@/components/InsightFilters";
import { OverviewTab } from "@/components/table1/OverviewTab";
import { ScoreGridTab } from "@/components/table1/ScoreGridTab";
import { IssueTrackingTab } from "@/components/table1/IssueTrackingTab";
import { meetingShortTitle } from "@/lib/kpis";
import { MEMBER_ROSTER } from "@/lib/memberRoster";
import { colors, spacing, typography, radius } from "@/theme/tokens";

type Tab = "overview" | "scores" | "issueTracking";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [memberFilter, setMemberFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    fetchInsights()
      .then(setRows)
      .catch(() => {
        setRows([]);
        setFetchFailed(true);
      });
  }, []);

  const members = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.memberName))].filter((m) => MEMBER_ROSTER.has(m)).sort(),
    [rows]
  );
  const meetings = useMemo(() => [...new Set((rows ?? []).map((r) => r.meetingTitle))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) => (!memberFilter || r.memberName === memberFilter) && (!meetingFilter || r.meetingTitle === meetingFilter)
  );

  function handleIssueTrackingTabPress() {
    if (tab === "issueTracking") return;
    setMemberFilter("");
    setMeetingFilter("");
    setTab("issueTracking");
  }

  if (!rows) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <InsightFilters
        members={members}
        meetings={meetings}
        memberFilter={memberFilter}
        meetingFilter={meetingFilter}
        onMemberChange={setMemberFilter}
        onMeetingChange={setMeetingFilter}
      />

      <View style={styles.linkRow}>
        <Pressable style={styles.adminLink} onPress={() => router.push("/admin" as any)}>
          <Text style={styles.adminLinkText}>관리자</Text>
        </Pressable>
      </View>

      {tab === "issueTracking" ? (
        <View style={styles.header}>
          <Text style={styles.title}>이슈추적사항</Text>
          <Text style={styles.disclaimer}>
            의원이 회의 중 제기했지만 아직 재검토되지 않은 사안입니다. 다음 확인 시점까지 지켜봐야 합니다.
          </Text>
        </View>
      ) : meetingFilter ? (
        <View style={styles.header}>
          <Text style={styles.title}>표1. {meetingShortTitle(meetingFilter)}</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>회의별 랭킹</Text>
          <Text style={styles.disclaimer}>회의를 선택하면 해당 회의의 표1로 전환됩니다.</Text>
        </View>
      )}
      <Text style={styles.kpiExplainer}>
        5개 KPI(사전준비도·정책생산력·실시간 압박력·성과전환력·사후책임성)는 종합 순위점수 없이 항상 독립적으로
        표시됩니다. 질의응답 구조가 없는 발언은 실시간 압박력·성과전환력이 &apos;―&apos;로 표기됩니다. 항목별 값은
        &apos;세부항목&apos; 탭에서 확인할 수 있습니다.
      </Text>

      <View style={styles.tabBar}>
        <Pressable style={[styles.tabButton, tab === "overview" && styles.tabButtonActive]} onPress={() => setTab("overview")}>
          <Text style={[styles.tabLabel, tab === "overview" && styles.tabLabelActive]}>개요</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "scores" && styles.tabButtonActive]} onPress={() => setTab("scores")}>
          <Text style={[styles.tabLabel, tab === "scores" && styles.tabLabelActive]}>세부항목</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "issueTracking" && styles.tabButtonActive]} onPress={handleIssueTrackingTabPress}>
          <Text style={[styles.tabLabel, tab === "issueTracking" && styles.tabLabelActive]}>이슈추적사항</Text>
        </Pressable>
      </View>

      {tab === "issueTracking" ? (
        <IssueTrackingTab />
      ) : fetchFailed ? (
        <View style={styles.center}>
          <Text style={styles.body}>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.body}>조건에 맞는 발언이 없습니다.</Text>
        </View>
      ) : tab === "overview" ? (
        <OverviewTab rows={filtered} />
      ) : (
        <ScoreGridTab rows={filtered} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.alternative },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.alternative },
  body: { ...typography.body2, color: colors.label.neutral },
  linkRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing[12] },
  adminLink: { paddingHorizontal: spacing[12], paddingVertical: spacing[4] },
  adminLinkText: { ...typography.label2, color: colors.label.alternative },
  header: { paddingHorizontal: spacing[12], paddingTop: spacing[4], paddingBottom: spacing[8] },
  title: { ...typography.headline1, color: colors.label.normal },
  disclaimer: { ...typography.caption1, color: colors.label.alternative, marginTop: spacing[4] },
  kpiExplainer: {
    ...typography.caption2,
    color: colors.label.alternative,
    paddingHorizontal: spacing[12],
    paddingBottom: spacing[8],
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: spacing[12],
    backgroundColor: colors.fill.normal,
    borderRadius: radius[8],
    padding: spacing[2],
  },
  tabButton: { flex: 1, paddingVertical: spacing[8], alignItems: "center", borderRadius: radius[6] },
  tabButtonActive: { backgroundColor: colors.background.normal },
  tabLabel: { ...typography.label1, color: colors.label.alternative },
  tabLabelActive: { color: colors.primary.normal },
});
