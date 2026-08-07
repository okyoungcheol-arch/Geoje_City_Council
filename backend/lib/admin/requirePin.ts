import { NextRequest, NextResponse } from "next/server";

export function requireAdminPin(request: NextRequest): NextResponse | null {
  const pin = request.headers.get("x-admin-pin");
  if (!pin || pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "invalid pin" }, { status: 401 });
  }
  return null;
}
