import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";

export const runtime = "nodejs";

// Brute-force guard. The admin surface is protected by a single shared 4-6 digit PIN
// compared with a plain string equality check (lib/admin/requirePin.ts), and this route
// is the unauthenticated entry point where that PIN can be guessed, so attempts are
// capped per client IP.
//
// NOTE: this is a BEST-EFFORT, SINGLE-INSTANCE limiter. The counters live in this
// module's memory, so Vercel running several concurrent function instances (or recycling
// one) gives an attacker a fresh budget per instance — it raises the cost of a brute
// force, it does not make it impossible. A shared store (e.g. Upstash Redis) would be
// required for a real guarantee; that upgrade is deliberately out of scope here.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  // Vercel always sets x-forwarded-for; x-real-ip is a fallback for other hosts/proxies.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string, now: number): boolean {
  const entry = attempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

// Keeps the Map from growing without bound across a long-lived instance's lifetime.
function pruneExpired(now: number) {
  for (const [ip, entry] of attempts) {
    if (now >= entry.resetAt) attempts.delete(ip);
  }
}

// NOTE: nothing beyond `runtime` and the HTTP method handlers may be exported from a
// route file — Next.js rejects unknown route exports at build time. Tests therefore
// isolate themselves by using a distinct x-forwarded-for per case rather than resetting
// this module's state.
export async function POST(request: NextRequest) {
  const now = Date.now();
  pruneExpired(now);

  if (isRateLimited(clientIp(request), now)) {
    return NextResponse.json({ error: "too many attempts" }, { status: 429 });
  }

  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true });
}
