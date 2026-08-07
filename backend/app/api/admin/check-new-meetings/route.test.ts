import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/scripts/scrape/session", () => ({
  openCouncilSession: vi.fn(() =>
    Promise.resolve({ browser: { close: vi.fn() }, session: { page: {}, csrfToken: "tok" } })
  ),
}));
vi.mock("@/scripts/scrape/meetingList", () => ({
  scrapeCategories: vi.fn(() => Promise.resolve([{ cmtCd: "C1", label: "본회의" }])),
  scrapeMeetingList: vi.fn(() =>
    Promise.resolve([
      { sourceMeetingId: "100", category: "본회의", title: "기존 회의", sessionRound: "제264회", sessionNo: "제1차", meetingDate: "2026-07-20", sourceUrl: "https://x/100" },
      { sourceMeetingId: "200", category: "본회의", title: "신규 회의", sessionRound: "제265회", sessionNo: "제1차", meetingDate: "2026-08-10", sourceUrl: "https://x/200" },
    ])
  ),
}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => Promise.resolve([{ sourceMeetingId: "100" }]) }) },
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");

test("returns only meetings not already in the DB", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/check-new-meetings", {
    method: "POST",
    headers: { "x-admin-pin": "1234" },
  });
  const res = await POST(req);
  const body = await res.json();
  expect(body.newMeetings).toHaveLength(1);
  expect(body.newMeetings[0].sourceMeetingId).toBe("200");
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/check-new-meetings", { method: "POST" });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
