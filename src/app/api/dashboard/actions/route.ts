import { headers as getHeaders } from "next/headers.js";
import { getPayload } from "payload";
import config from "@/payload.config";
import { NextResponse } from "next/server";

/**
 * Maps action names to the field update they produce.
 * Used by the dashboard quick-action buttons.
 */
export const ACTION_MAP: Record<string, Record<string, unknown>> = {
  mark_intake_received: { status: "intake_received" },
  start_work: { status: "in_progress" },
  mark_awaiting: { status: "awaiting_pics_or_payment" },
  mark_ready_to_ship: { status: "ready_to_ship" },
  mark_delivered: { status: "delivered" },
};

/**
 * POST handler for dashboard quick actions.
 * Body: { jobId: number, action: string }
 *
 * Auth-protected: requires a logged-in Payload user.
 */
export async function POST(request: Request) {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { jobId: number; action: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { jobId, action } = body;

  if (!jobId || !action) {
    return NextResponse.json(
      { error: "Missing jobId or action" },
      { status: 400 }
    );
  }

  // Direct status assignment from the column select
  if (action === "set_status") {
    const VALID_STATUSES = [
      "inquiry", "intake_received", "in_progress",
      "awaiting_pics_or_payment", "ready_to_ship", "delivered", "portfolio_ready",
    ];
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    try {
      await payload.update({ collection: "jobs", id: jobId, data: { status: body.status } });
      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Handle toggle_pics_received separately (read-then-update)
  if (action === "toggle_pics_received") {
    try {
      const job = await payload.findByID({ collection: "jobs", id: jobId });
      await payload.update({
        collection: "jobs",
        id: jobId,
        data: { pics_received: !job.pics_received },
      });
      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Standard status transitions
  const update = ACTION_MAP[action];
  if (!update) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    await payload.update({
      collection: "jobs",
      id: jobId,
      data: update,
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
