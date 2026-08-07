import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import {
  loadPin,
  savePin,
  verifyPin,
  checkNewMeetings,
  scrapeMeeting,
  processBatch,
  type ScrapedMeetingSummary,
} from "@/lib/adminApi";
import { colors, typography, spacing, radius } from "@/theme/tokens";

const POLL_INTERVAL_MS = 4000;
const BATCH_LIMIT = 5;

export default function AdminScreen() {
  const [pin, setPin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [newMeetings, setNewMeetings] = useState<ScrapedMeetingSummary[] | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, excluded: 0, failed: 0, remaining: 0 });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPin().then(setPin);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  async function submitPin() {
    const ok = await verifyPin(pinInput);
    if (!ok) {
      setPinError(true);
      return;
    }
    await savePin(pinInput);
    setPin(pinInput);
  }

  async function handleCheck() {
    if (!pin) return;
    setChecking(true);
    try {
      setNewMeetings(await checkNewMeetings(pin));
    } finally {
      setChecking(false);
    }
  }

  async function handleScrape(meeting: ScrapedMeetingSummary) {
    if (!pin) return;
    setScrapingId(meeting.sourceMeetingId);
    try {
      await scrapeMeeting(pin, meeting);
      setNewMeetings((prev) => (prev ? prev.filter((m) => m.sourceMeetingId !== meeting.sourceMeetingId) : prev));
    } finally {
      setScrapingId(null);
    }
  }

  async function pollOnce() {
    if (!pin) return;
    const result = await processBatch(pin, BATCH_LIMIT);
    setProgress((prev) => ({
      processed: prev.processed + result.processed,
      excluded: prev.excluded + result.excluded,
      failed: prev.failed + result.failed,
      remaining: result.remaining,
    }));
    if (result.remaining > 0) {
      pollTimer.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
    } else {
      setProcessing(false);
    }
  }

  function startProcessing() {
    setProgress({ processed: 0, excluded: 0, failed: 0, remaining: 0 });
    setProcessing(true);
    pollOnce();
  }

  function stopProcessing() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setProcessing(false);
  }

  if (!pin) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>관리자 PIN</Text>
        <TextInput
          style={styles.pinInput}
          value={pinInput}
          onChangeText={(v) => {
            setPinInput(v);
            setPinError(false);
          }}
          secureTextEntry
          keyboardType="number-pad"
          placeholder="PIN 입력"
        />
        {pinError && <Text style={styles.error}>잘못된 PIN입니다</Text>}
        <Pressable style={styles.button} onPress={submitPin}>
          <Text style={styles.buttonLabel}>확인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>신규 회의 체크</Text>
      <Pressable style={styles.button} onPress={handleCheck} disabled={checking}>
        {checking ? <ActivityIndicator color={colors.background.normal} /> : <Text style={styles.buttonLabel}>체크하기</Text>}
      </Pressable>

      {newMeetings && newMeetings.length === 0 && <Text style={styles.body}>신규 회의 없음</Text>}
      {newMeetings?.map((m) => (
        <View key={m.sourceMeetingId} style={styles.meetingRow}>
          <Text style={styles.body}>{m.title}</Text>
          <Pressable style={styles.smallButton} onPress={() => handleScrape(m)} disabled={scrapingId === m.sourceMeetingId}>
            {scrapingId === m.sourceMeetingId ? (
              <ActivityIndicator color={colors.background.normal} />
            ) : (
              <Text style={styles.buttonLabel}>스크래핑</Text>
            )}
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>발언 처리</Text>
      {processing ? (
        <>
          <Text style={styles.body}>
            {progress.processed + progress.excluded + progress.failed}건 처리됨 (제외 {progress.excluded}, 실패 {progress.failed}) · 남음 {progress.remaining}
          </Text>
          <Pressable style={styles.button} onPress={stopProcessing}>
            <Text style={styles.buttonLabel}>일시정지</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.button} onPress={startProcessing}>
          <Text style={styles.buttonLabel}>처리 시작</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[16], backgroundColor: colors.background.normal, gap: spacing[8] },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing[16], gap: spacing[8], backgroundColor: colors.background.normal },
  title: { ...typography.title3, color: colors.label.normal },
  sectionTitle: { ...typography.label1, color: colors.label.normal, marginTop: spacing[12] },
  body: { ...typography.body2, color: colors.label.neutral },
  error: { ...typography.label2, color: colors.status.negative },
  pinInput: {
    borderWidth: 1,
    borderColor: colors.line.solid,
    borderRadius: radius.full,
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[8],
    minWidth: 160,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primary.normal,
    borderRadius: radius.full,
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[12],
    alignItems: "center",
  },
  smallButton: {
    backgroundColor: colors.primary.normal,
    borderRadius: radius.full,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[10],
  },
  buttonLabel: { ...typography.label2, color: colors.background.normal },
  meetingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
