// mobile/src/app/index.tsx
import { useEffect, useMemo, useState } from "react";
import { FlatList, ActivityIndicator, StyleSheet, View } from "react-native";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightCard } from "@/components/InsightCard";
import { InsightFilters } from "@/components/InsightFilters";
import { colors, spacing } from "@/theme/tokens";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [memberFilter, setMemberFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [minGeojeImpact, setMinGeojeImpact] = useState(1);

  useEffect(() => {
    fetchInsights().then(setRows).catch(() => setRows([]));
  }, []);

  const members = useMemo(() => [...new Set((rows ?? []).map((r) => r.memberName))].sort(), [rows]);
  const meetings = useMemo(() => [...new Set((rows ?? []).map((r) => r.meetingTitle))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) =>
      (!memberFilter || r.memberName === memberFilter) &&
      (!meetingFilter || r.meetingTitle === meetingFilter) &&
      r.geojeImpactScore >= minGeojeImpact
  );

  if (!rows) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={filtered}
      keyExtractor={(row) => String(row.statementId)}
      ListHeaderComponent={
        <InsightFilters
          members={members}
          meetings={meetings}
          memberFilter={memberFilter}
          meetingFilter={meetingFilter}
          minGeojeImpact={minGeojeImpact}
          onMemberChange={setMemberFilter}
          onMeetingChange={setMeetingFilter}
          onMinGeojeImpactChange={setMinGeojeImpact}
        />
      }
      renderItem={({ item }) => <InsightCard row={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing[12], backgroundColor: colors.background.alternative, flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.alternative },
});
