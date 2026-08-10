// mobile/src/components/InsightFilters.tsx
import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { colors, typography, spacing, radius, fontWeights } from "@/theme/tokens";
import { meetingSessionTitle } from "@/lib/axes";

interface Props {
  members: string[];
  meetings: string[];
  memberFilter: string;
  meetingFilter: string;
  onMemberChange: (v: string) => void;
  onMeetingChange: (v: string) => void;
}

export function InsightFilters({ members, meetings, memberFilter, meetingFilter, onMemberChange, onMeetingChange }: Props) {
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);

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

      <Pressable style={styles.combo} onPress={() => setMeetingPickerOpen(true)}>
        <Text style={styles.comboLabel} numberOfLines={1}>
          {meetingFilter ? meetingSessionTitle(meetingFilter) : "전체회의"}
        </Text>
        <Text style={styles.comboChevron}>▾</Text>
      </Pressable>

      <Modal visible={meetingPickerOpen} transparent animationType="fade" onRequestClose={() => setMeetingPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMeetingPickerOpen(false)}>
          <Pressable style={styles.modalPanel} onPress={(e) => e.stopPropagation()}>
            <ScrollView>
              <Pressable
                style={[styles.option, !meetingFilter && styles.optionActive]}
                onPress={() => {
                  onMeetingChange("");
                  setMeetingPickerOpen(false);
                }}
              >
                <Text style={[styles.optionLabel, !meetingFilter && styles.optionLabelActive]}>전체회의</Text>
              </Pressable>
              {meetings.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.option, meetingFilter === m && styles.optionActive]}
                  onPress={() => {
                    onMeetingChange(m);
                    setMeetingPickerOpen(false);
                  }}
                >
                  <Text style={[styles.optionLabel, meetingFilter === m && styles.optionLabelActive]}>
                    {meetingSessionTitle(m)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  combo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[10],
    borderRadius: radius[8],
    borderWidth: 1,
    borderColor: colors.line.solid,
    backgroundColor: colors.background.normal,
    marginBottom: spacing[8],
  },
  comboLabel: { ...typography.label1, color: colors.label.normal, flexShrink: 1 },
  comboChevron: { ...typography.label1, color: colors.label.alternative, marginLeft: spacing[8] },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[24],
  },
  modalPanel: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "70%",
    borderRadius: radius[12],
    backgroundColor: colors.background.normal,
    overflow: "hidden",
  },
  option: { paddingHorizontal: spacing[16], paddingVertical: spacing[12] },
  optionActive: { backgroundColor: colors.fill.normal },
  optionLabel: { ...typography.body2, color: colors.label.normal },
  optionLabelActive: { color: colors.primary.normal, fontWeight: fontWeights.semibold },
});
