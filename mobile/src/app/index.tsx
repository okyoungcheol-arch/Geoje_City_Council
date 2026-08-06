// mobile/src/app/index.tsx
import { useEffect, useState } from "react";
import { FlatList, ActivityIndicator, StyleSheet, View } from "react-native";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightCard } from "@/components/InsightCard";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);

  useEffect(() => {
    fetchInsights().then(setRows).catch(() => setRows([]));
  }, []);

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
      data={rows}
      keyExtractor={(row) => String(row.statementId)}
      renderItem={({ item }) => <InsightCard row={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
