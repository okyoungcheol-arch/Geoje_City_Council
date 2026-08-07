import { test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireAdminPin } from "./requirePin";

test("returns 401 when the header is missing", async () => {
  vi.stubEnv("ADMIN_PIN", "1234");
  const req = new NextRequest("http://localhost:3000/api/admin/verify-pin", { method: "POST" });
  const result = requireAdminPin(req);
  expect(result).not.toBeNull();
  expect(result!.status).toBe(401);
});

test("returns 401 when the header doesn't match ADMIN_PIN", async () => {
  vi.stubEnv("ADMIN_PIN", "1234");
  const req = new NextRequest("http://localhost:3000/api/admin/verify-pin", {
    method: "POST",
    headers: { "x-admin-pin": "0000" },
  });
  const result = requireAdminPin(req);
  expect(result).not.toBeNull();
  expect(result!.status).toBe(401);
});

test("returns null when the header matches ADMIN_PIN", async () => {
  vi.stubEnv("ADMIN_PIN", "1234");
  const req = new NextRequest("http://localhost:3000/api/admin/verify-pin", {
    method: "POST",
    headers: { "x-admin-pin": "1234" },
  });
  const result = requireAdminPin(req);
  expect(result).toBeNull();
});
