import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.stubEnv("ADMIN_PIN", "1234");
const { POST } = await import("./route");

// The route's rate limiter keeps per-IP counters in module memory with no reset hook
// (Next.js rejects unknown route exports), so every test uses its own client IP.
function req(pin: string | null, ip: string) {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (pin !== null) headers["x-admin-pin"] = pin;
  return new NextRequest("http://localhost:3000/api/admin/verify-pin", { method: "POST", headers });
}

test("accepts the correct PIN", async () => {
  const res = await POST(req("1234", "10.0.0.1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("rejects an incorrect PIN with 401", async () => {
  const res = await POST(req("9999", "10.0.0.2"));
  expect(res.status).toBe(401);
});

test("rejects a missing PIN with 401", async () => {
  const res = await POST(req(null, "10.0.0.3"));
  expect(res.status).toBe(401);
});

test("returns 429 once the per-IP attempt limit is exceeded", async () => {
  const ip = "10.0.0.4";
  // 10 attempts are allowed within the window.
  for (let i = 0; i < 10; i++) {
    const res = await POST(req("9999", ip));
    expect(res.status).toBe(401);
  }
  const limited = await POST(req("9999", ip));
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ error: "too many attempts" });

  // The block is not bypassable by then supplying the correct PIN.
  const withCorrectPin = await POST(req("1234", ip));
  expect(withCorrectPin.status).toBe(429);
});

test("rate limits per IP, not globally", async () => {
  const ip = "10.0.0.5";
  for (let i = 0; i < 11; i++) await POST(req("9999", ip));
  expect((await POST(req("9999", ip))).status).toBe(429);
  // A different client is unaffected.
  expect((await POST(req("1234", "10.0.0.6"))).status).toBe(200);
});

test("uses the first x-forwarded-for entry as the client IP", async () => {
  const headers = { "x-forwarded-for": "10.0.0.7, 172.16.0.1", "x-admin-pin": "1234" };
  const res = await POST(new NextRequest("http://localhost:3000/api/admin/verify-pin", { method: "POST", headers }));
  expect(res.status).toBe(200);
});
