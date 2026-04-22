import { headers as getHeaders } from "next/headers.js";
import { getPayload } from "payload";
import config from "@/payload.config";
import { NextResponse } from "next/server";

const VALID_STATUSES = ["researched", "contacted", "responded", "confirmed"];

/**
 * POST handler for organization status changes from the dashboard.
 * Body: { orgId: number, status: string }
 */
export async function POST(request: Request) {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orgId: number; status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orgId, status } = body;

  if (!orgId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid orgId or status" }, { status: 400 });
  }

  try {
    await payload.update({ collection: "organizations", id: orgId, data: { status } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
