import { NextResponse } from "next/server";
import { getFleetDatabase, saveDashboardPreset } from "@/lib/fleetDb";
import type { DashboardPreset } from "@/lib/fleetTypes";

export async function GET() {
  const database = await getFleetDatabase();
  return NextResponse.json(database);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; tenantId?: string; preset?: DashboardPreset };

  if (body.action === "save-preset" && body.tenantId && body.preset) {
    const database = await saveDashboardPreset(body.tenantId, body.preset);
    return NextResponse.json(database);
  }

  return NextResponse.json({ message: "Unsupported action." }, { status: 400 });
}
