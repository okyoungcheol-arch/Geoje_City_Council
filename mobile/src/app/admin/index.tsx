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
// Must stay <= the backend's MAX_LIMIT (backend/app/api/admin/process-batch/route.ts),
// which clamps anything larger server-side. Keep the two in sync.
const BATCH_LIMIT = 3;

export default function AdminScreen() {
  const [pin, setPin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinNetworkError, setPinNetworkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [newMeetings, setNewMeetings] = useState<ScrapedMeetingSummary[] | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ processed: 0, excluded: 0, failed: 0, remaining: 0 });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against an in-flight processBatch request resuming the poll loop after the
  // user pressed 일시정지 or left the screen. Clearing pollTimer alone is not enough:
  // the pending request's continuation would still schedule a fresh setTimeout (and
  // setState after unmount).
  const activeRef = useRef(true);

  useEffect(() => {
    // expo-secure-store throws on web; a storage-read failure should just leave the
    // PIN gate showing rather than produce an unhandled rejection at mount.
    loadPin()
      .then(setPin)
      .catch(() => setPin(null));
    return () => {
      activeRef.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  async function submitPin() {
    let ok: boolean;
    try {
      ok = await verifyPin(pinInput);
    } catch (err) {
      setPinNetworkError("네트워크 오류: PIN 확인에 실패했습니다");
      return;
    }
    if (!ok) {
      setPinError(true);
      return;
    }
    // Verification succeeded. Persisting the PIN is a convenience for next launch and
    // throws on web (expo-secure-store) — never let that failure block access, and never
    // surface it as a PIN-verification error.
    try {
      await savePin(pinInput);
    } catch (err) {
      console.error("PIN 저장 실패 (이번 세션 사용에는 영향 없음)", err);
    }
    setPin(pinInput);
  }

  async function handleCheck() {
    if (!pin) return;
    setChecking(true);
    setCheckError(null);
    try {
      setNewMeetings(await checkNewMeetings(pin));
    } catch (err) {
      setCheckError("신규 회의 확인 실패");
    } finally {
      setChecking(false);
    }
  }

  async function handleScrape(meeting: ScrapedMeetingSummary) {
    if (!pin) return;
    setScrapingId(meeting.sourceMeetingId);
    setScrapeError(null);
    try {
      await scrapeMeeting(pin, meeting);
      setNewMeetings((prev) => (prev ? prev.filter((m) => m.sourceMeetingId !== meeting.sourceMeetingId) : prev));
    } catch (err) {
      setScrapeError(`스크래핑 실패: ${meeting.title}`);
    } finally {
      setScrapingId(null);
    }
  }

  async function pollOnce() {
    if (!pin) return;
    try {
      const result = await processBatch(pin, BATCH_LIMIT);
      if (!activeRef.current) return;
      setProgress((prev) => ({
        processed: prev.processed + result.processed,
        excluded: prev.excluded + result.excluded,
        failed: prev.failed + result.failed,
        remaining: result.remaining,
      }));
      // Poison-statement guard. Failed statements are deliberately not persisted to
      // statement_insights so they can be retried, which means a deterministically
      // failing statement stays at the head of every subsequent batch. If a batch made
      // literally zero forward progress (nothing processed, nothing excluded) and only
      // produced failures, stop instead of polling forever and burning paid AI calls on
      // the same doomed statements. A batch mixing successes and failures keeps going.
      if (result.processed === 0 && result.excluded === 0 && result.failed > 0) {
        setProcessingError("일부 발언 처리에 실패했습니다 — 반복 실패로 자동 중지되었습니다");
        setProcessing(false);
        return;
      }
      if (result.remaining > 0) {
        pollTimer.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
      } else {
        setProcessing(false);
      }
    } catch (err) {
      if (!activeRef.current) return;
      setProcessingError("발언 처리 실패");
      setProcessing(false);
    }
  }

  function startProcessing() {
    activeRef.current = true;
    setProgress({ processed: 0, excluded: 0, failed: 0, remaining: 0 });
    setProcessingError(null);
    setProcessing(true);
    pollOnce();
  }

  function stopProcessing() {
    activeRef.current = false;
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
            setPinNetworkError(null);
          }}
          secureTextEntry
          keyboardType="number-pad"
          placeholder="PIN 입력"
        />
        {pinError && <Text style={styles.error}>잘못된 PIN입니다</Text>}
        {pinNetworkError && <Text style={styles.error}>{pinNetworkError}</Text>}
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
      {checkError && <Text style={styles.error}>{checkError}</Text>}

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
      {scrapeError && <Text style={styles.error}>{scrapeError}</Text>}

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
        <>
          <Pressable style={styles.button} onPress={startProcessing}>
            <Text style={styles.buttonLabel}>처리 시작</Text>
          </Pressable>
          {processingError && <Text style={styles.error}>{processingError}</Text>}
        </>
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
