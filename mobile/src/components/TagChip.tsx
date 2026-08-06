// mobile/src/components/TagChip.tsx
import { Pressable, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export function TagChip({ tag, statementId }: { tag: string; statementId: number }) {
  return (
    <Pressable
      onPress={() => router.push(`/statement/${statementId}`)}
      style={styles.chip}
    >
      <Text style={styles.label}>{tag}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.fill.normal,
    borderRadius: radius[16],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    marginRight: spacing[6],
    marginBottom: spacing[6],
  },
  label: { ...typography.caption1, color: colors.primary.normal },
});
