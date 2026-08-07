import * as SecureStore from "expo-secure-store";

const PIN_KEY = "gjcl_admin_pin";

export interface ScrapedMeetingSummary {
  sourceMeetingId: string;
  category: string;
  title: string;
  sessionRound: string;
  sessionNo: string;
  meetingDate: string | null;
  sourceUrl: string;
}

export interface ProcessBatchResult {
  processed: number;
  excluded: number;
  failed: number;
  remaining: number;
}

function apiBase(): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  return base;
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function loadPin(): Promise<string | null> {
  return SecureStore.getItemAsync(PIN_KEY);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/verify-pin`, {
    method: "POST",
    headers: { "x-admin-pin": pin },
  });
  return res.ok;
}

export async function checkNewMeetings(pin: string): Promise<ScrapedMeetingSummary[]> {
  const res = await fetch(`${apiBase()}/api/admin/check-new-meetings`, {
    method: "POST",
    headers: { "x-admin-pin": pin },
  });
  if (!res.ok) throw new Error(`check-new-meetings failed: ${res.status}`);
  const body = await res.json();
  return body.newMeetings;
}

export async function scrapeMeeting(pin: string, meeting: ScrapedMeetingSummary): Promise<{ statementsAdded: number }> {
  const res = await fetch(`${apiBase()}/api/admin/scrape-meeting`, {
    method: "POST",
    headers: { "x-admin-pin": pin, "content-type": "application/json" },
    body: JSON.stringify({ meeting }),
  });
  if (!res.ok) throw new Error(`scrape-meeting failed: ${res.status}`);
  return res.json();
}

export async function processBatch(pin: string, limit: number): Promise<ProcessBatchResult> {
  const res = await fetch(`${apiBase()}/api/admin/process-batch`, {
    method: "POST",
    headers: { "x-admin-pin": pin, "content-type": "application/json" },
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) throw new Error(`process-batch failed: ${res.status}`);
  return res.json();
}
