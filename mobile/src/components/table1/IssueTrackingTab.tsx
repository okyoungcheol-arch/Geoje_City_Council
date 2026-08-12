// mobile/src/components/table1/IssueTrackingTab.tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { fetchIssueTickets, type IssueTicket } from "@/lib/api";
import { colors, typography, spacing, radius } from "@/theme/tokens";

function ticketCode(index: number): string {
  return `T-${String(index + 1).padStart(2, "0")}`;
}

interface Props {
  /** 선택된 의원 이름. 빈 문자열이면 전체 의원의 이슈를 보여준다. */
  memberFilter: string;
}

export function IssueTrackingTab({ memberFilter }: Props) {
  const [tickets, setTickets] = useState<IssueTicket[] | null>(null);

  useEffect(() => {
    fetchIssueTickets()
      .then(setTickets)
      .catch(() => setTickets([]));
  }, []);

  // 티켓 코드(T-01, T-02, ...)는 필터와 무관하게 전체 목록 순서로 고정해야 화면을 오가도
  // 같은 이슈가 같은 번호를 유지한다.
  const codeByTicketId = useMemo(() => {
    const map = new Map<number, string>();
    (tickets ?? []).forEach((ticket, index) => map.set(ticket.id, ticketCode(index)));
    return map;
  }, [tickets]);

  if (!tickets) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const filteredTickets = memberFilter ? tickets.filter((t) => t.memberName === memberFilter) : tickets;

  const header = (
    <View style={styles.headerRow}>
      <View style={[styles.cell, styles.codeCell]}>
        <Text style={styles.headerLabel}>#</Text>
      </View>
      <View style={[styles.cell, styles.memberCell]}>
        <Text style={styles.headerLabel}>의원</Text>
      </View>
      <View style={[styles.cell, styles.descriptionCell]}>
        <Text style={styles.headerLabel}>등록 사안</Text>
      </View>
      <View style={[styles.cell, styles.checkpointCell]}>
        <Text style={styles.headerLabel}>확인 시점</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={filteredTickets}
        keyExtractor={(ticket) => String(ticket.id)}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.body}>
              {memberFilter ? "선택한 의원의 추적 중인 이슈가 없습니다." : "추적 중인 이슈가 없습니다."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${item.registeredStatementId}`)}>
            <View style={[styles.cell, styles.codeCell]}>
              <Text style={styles.codeLabel}>{codeByTicketId.get(item.id)}</Text>
            </View>
            <View style={[styles.cell, styles.memberCell]}>
              <Text style={styles.memberLabel}>{item.memberName}</Text>
            </View>
            <View style={[styles.cell, styles.descriptionCell]}>
              <Text style={styles.descriptionLabel} numberOfLines={2}>
                {item.description}
              </Text>
            </View>
            <View style={[styles.cell, styles.checkpointCell]}>
              <Text style={styles.checkpointLabel} numberOfLines={2}>
                {item.reviewCheckpoint ?? "―"}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing[24] },
  body: { ...typography.body2, color: colors.label.neutral },
  list: { flex: 1 },
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
  codeCell: { width: 52 },
  memberCell: { width: 68 },
  descriptionCell: { flex: 1 },
  checkpointCell: { width: 104, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  codeLabel: { ...typography.caption1, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  descriptionLabel: { ...typography.body2, color: colors.label.normal },
  checkpointLabel: { ...typography.body2, color: colors.label.neutral, textAlign: "right" },
});
