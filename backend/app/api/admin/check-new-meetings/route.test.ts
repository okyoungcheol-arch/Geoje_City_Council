import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const scrapeLateDoPageMock = vi.fn();

vi.mock("@/scripts/scrape/launchBrowser", () => ({
  launchChromium: vi.fn(() =>
    Promise.resolve({ newPage: () => Promise.resolve({}), close: vi.fn() })
  ),
}));
vi.mock("@/scripts/scrape/meetingList", () => ({
  scrapeLateDoPage: scrapeLateDoPageMock,
}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => Promise.resolve([{ sourceMeetingId: "100" }]) }) },
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/admin/check-new-meetings", {
    method: "POST",
    headers: { "x-admin-pin": "1234" },
  });
}

test("returns only meetings not already in the DB", async () => {
  scrapeLateDoPageMock.mockReset();
  scrapeLateDoPageMock.mockImplementation((_page: unknown, pageNo: number) =>
    Promise.resolve(
      pageNo === 1
        ? [
            { sourceMeetingId: "100", category: "본회의", title: "기존 회의", sessionRound: "제264회", sessionNo: "제1차", meetingDate: "2026-07-20", sourceUrl: "https://x/100" },
            { sourceMeetingId: "200", category: "본회의", title: "신규 회의", sessionRound: "제265회", sessionNo: "제1차", meetingDate: "2026-08-10", sourceUrl: "https://x/200" },
          ]
        : []
    )
  );

  const res = await POST(makeRequest());
  const body = await res.json();
  expect(body.newMeetings).toHaveLength(1);
  expect(body.newMeetings[0].sourceMeetingId).toBe("200");
});

test("stops paginating once a page is entirely already-known meetings (early exit)", async () => {
  scrapeLateDoPageMock.mockReset();
  scrapeLateDoPageMock.mockImplementation((_page: unknown, pageNo: number) =>
    Promise.resolve(
      pageNo === 1
        ? [{ sourceMeetingId: "100", category: "본회의", title: "기존 회의", sessionRound: "제264회", sessionNo: "제1차", meetingDate: "2026-07-20", sourceUrl: "https://x/100" }]
        : [{ sourceMeetingId: "999", category: "본회의", title: "절대 도달하면 안 됨", sessionRound: "제1회", sessionNo: "제1차", meetingDate: "2020-01-01", sourceUrl: "https://x/999" }]
    )
  );

  const res = await POST(makeRequest());
  const body = await res.json();
  expect(body.newMeetings).toHaveLength(0);
  expect(scrapeLateDoPageMock).toHaveBeenCalledTimes(1); // page 2 must never be fetched
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/check-new-meetings", { method: "POST" });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
