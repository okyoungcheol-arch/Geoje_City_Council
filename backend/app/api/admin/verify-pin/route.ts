import { NextRequest, NextResponse } from "next/server";
import { requireAdminPin } from "@/lib/admin/requirePin";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPin(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true });
}
