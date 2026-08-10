// mobile/src/components/InsightFilters.tsx
import { createElement, useState, type ChangeEvent } from "react";
import { Platform, View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
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

      <MeetingCombo meetings={meetings} meetingFilter={meetingFilter} onMeetingChange={onMeetingChange} />
    </View>
  );
}

interface MeetingComboProps {
  meetings: string[];
  meetingFilter: string;
  onMeetingChange: (v: string) => void;
}

// 웹에서는 실제 <select>를 써서 브라우저 기본 콤보박스 UI(테두리 화살표, 클릭 시 바로 아래
// 펼쳐지는 목록)를 그대로 활용한다 — 화면 전체를 덮는 모달 팝업보다 "이건 선택 상자다"라는
// 게 즉시 드러난다. 네이티브(iOS/Android)에는 <select> DOM 엘리먼트가 없으므로 액션시트형
// 모달 목록을 그대로 유지한다.
function MeetingCombo({ meetings, meetingFilter, onMeetingChange }: MeetingComboProps) {
  if (Platform.OS === "web") {
    return createElement(
      "select",
      {
        value: meetingFilter,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => onMeetingChange(e.target.value),
        style: webSelectStyle,
        "aria-label": "회의 선택",
      } as Record<string, unknown>,
      createElement("option", { value: "" }, "전체회의"),
      ...meetings.map((m) => createElement("option", { key: m, value: m }, meetingSessionTitle(m)))
    );
  }

  return <NativeMeetingPicker meetings={meetings} meetingFilter={meetingFilter} onMeetingChange={onMeetingChange} />;
}

function NativeMeetingPicker({ meetings, meetingFilter, onMeetingChange }: MeetingComboProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.combo} onPress={() => setOpen(true)}>
        <Text style={styles.comboLabel} numberOfLines={1}>
          {meetingFilter ? meetingSessionTitle(meetingFilter) : "전체회의"}
        </Text>
        <Text style={styles.comboChevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalPanel} onPress={(e) => e.stopPropagation()}>
            <ScrollView>
              <Pressable
                style={[styles.option, !meetingFilter && styles.optionActive]}
                onPress={() => {
                  onMeetingChange("");
                  setOpen(false);
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
                    setOpen(false);
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
    </>
  );
}

// React DOM 인라인 style은 camelCase 키를 그대로 쓰고 숫자는 자동으로 px가 붙는다 —
// StyleSheet.create가 아니라 일반 객체인 이유는 이 스타일이 RN 컴포넌트가 아니라
// <select> DOM 엘리먼트에 직접 꽂히기 때문이다.
const webSelectStyle = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: typography.label1.fontFamily,
  fontWeight: typography.label1.fontWeight,
  fontSize: typography.label1.fontSize,
  color: colors.label.normal,
  backgroundColor: colors.background.normal,
  border: `1px solid ${colors.line.solid}`,
  borderRadius: radius[8],
  padding: `${spacing[10]}px ${spacing[12]}px`,
  marginBottom: spacing[8],
  cursor: "pointer",
};

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
