// mobile/src/components/InsightFilters.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { colors, typography, spacing, radius } from "@/theme/tokens";
import { meetingShortTitle } from "@/lib/axes";

interface Props {
  members: string[];
  meetings: string[];
  memberFilter: string;
  meetingFilter: string;
  onMemberChange: (v: string) => void;
  onMeetingChange: (v: string) => void;
}

export function InsightFilters({ members, meetings, memberFilter, meetingFilter, onMemberChange, onMeetingChange }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Pressable onPress={() => onMemberChange("")} style={[styles.pill, !memberFilter && styles.pillActive]}>
          <Text style={[styles.pillLabel, !memberFilter && styles.pillLabelActive]}>전체 의원</Text>
        </Pressable>
        {members.map((m) => (
          <Pressable key={m} onPress={() => onMemberChange(m)} style={[styles.pill, memberFilter === m && styles.pillActive]}>
            <Text style={[styles.pillLabel, memberFilter === m && styles.pillLabelActive]}>{m}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Pressable onPress={() => onMeetingChange("")} style={[styles.pill, !meetingFilter && styles.pillActive]}>
          <Text style={[styles.pillLabel, !meetingFilter && styles.pillLabelActive]}>전체 회의</Text>
        </Pressable>
        {meetings.map((m) => (
          <Pressable key={m} onPress={() => onMeetingChange(m)} style={[styles.pill, meetingFilter === m && styles.pillActive]}>
            <Text style={[styles.pillLabel, meetingFilter === m && styles.pillLabelActive]}>{meetingShortTitle(m)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing[12], paddingTop: spacing[8] },
  row: { flexDirection: "row", marginBottom: spacing[8] },
  pill: {
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.fill.normal,
    marginRight: spacing[6],
  },
  pillActive: { backgroundColor: colors.primary.normal },
  pillLabel: { ...typography.label2, color: colors.label.normal },
  pillLabelActive: { color: colors.background.normal },
});
