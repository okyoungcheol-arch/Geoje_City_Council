import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/pipeline/processStatement", () => ({
  getPendingStatementIds: vi.fn(() => Promise.resolve([1, 2, 3])),
  processOneStatement: vi.fn((id: number) =>
    Promise.resolve(
      id === 1
        ? { statementId: 1, outcome: "processed" }
        : id === 2
          ? { statementId: 2, outcome: "excluded", reason: "의사진행 발언" }
          : { statementId: 3, outcome: "failed", reason: "rate limited" }
    )
  ),
  countPendingStatements: vi.fn(() => Promise.resolve(339)),
}));

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");
const { getPendingStatementIds } = await import("@/lib/pipeline/processStatement");

test("tallies processed/excluded/failed and reports remaining count", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/process-batch", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ limit: 3 }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(body).toEqual({ processed: 1, excluded: 1, failed: 1, remaining: 339 });
});

test("clamps limit to the server-side maximum of 10", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/process-batch", {
    method: "POST",
    headers: { "x-admin-pin": "1234", "content-type": "application/json" },
    body: JSON.stringify({ limit: 999 }),
  });
  await POST(req);
  expect(getPendingStatementIds).toHaveBeenCalledWith(10);
});

test("rejects requests without a valid PIN", async () => {
  const req = new NextRequest("http://localhost:3000/api/admin/process-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 5 }),
  });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
