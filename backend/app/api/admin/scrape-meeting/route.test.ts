import { test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/scrape/upsertMeeting", () => ({
  upsertScrapedMeeting: vi.fn(() => Promise.resolve({ meetingId: 42, statementsAdded: 87 })),
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");
const { upsertScrapedMeeting } = await import("@/lib/scrape/upsertMeeting");

const sampleMeeting = {
  sourceMeetingId: "200",
  category: "본회의",
  title: "신규 회의",
  sessionRound: "제265회",
  sessionNo: "제1차",
  meetingDate: "2026-08-10",
  sourceUrl: "https://www.gjcl.go.kr/viewer/minutes.do?uid=200",
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("scrapes the given meeting and returns the added-statement count", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ meeting: sampleMeeting }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(body.statementsAdded).toBe(87);
  expect(upsertScrapedMeeting).toHaveBeenCalledWith(sampleMeeting);
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meeting: sampleMeeting }),
  });
  const res = await POST(req);
  expect(res.status).toBe(401);
});

test("returns 400 when the meeting body is missing required fields", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ meeting: { title: "제목만 있음" } }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});

// SSRF guard: the route drives a server-side headless browser to sourceUrl, so a
// PIN holder must not be able to point it at an arbitrary host.
test("returns 400 when sourceUrl is on a non-council origin", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({
      meeting: { ...sampleMeeting, sourceUrl: "http://169.254.169.254/latest/meta-data/" },
    }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body.error).toBe("invalid meeting payload");
  expect(body.issues.some((i: { path: string[] }) => i.path.includes("sourceUrl"))).toBe(true);
  expect(upsertScrapedMeeting).not.toHaveBeenCalled();
});

test("returns 400 when sourceUrl only looks like the council host (subdomain spoof)", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/scrape-meeting", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({
      meeting: { ...sampleMeeting, sourceUrl: "https://www.gjcl.go.kr.evil.example/viewer/minutes.do?uid=200" },
    }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
  expect(upsertScrapedMeeting).not.toHaveBeenCalled();
});
