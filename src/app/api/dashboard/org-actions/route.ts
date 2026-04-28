import { headers as getHeaders } from "next/headers.js";
import { getPayload } from "payload";
import config from "@/payload.config";
import { NextResponse } from "next/server";

const VALID_STATUSES = [
  "researched", "contacted", "opened_email", "responded", "meeting_scheduled",
  "upcoming_event", "ongoing_relationship", "past_collaborator",
  "declined", "no_response",
] as const;
type OrgStatus = (typeof VALID_STATUSES)[number];

const VALID_FIT_SCORES = ["top_tier", "strong", "worth_trying"] as const;
type OrgFitScore = (typeof VALID_FIT_SCORES)[number];

type Body =
  | { orgId: number; action?: "set_status"; status: string }
  | { orgId: number; action: "set_fit_score"; fitScore: string | null }
  | { orgId: number; action: "toggle_pinned" }
  | { orgId: number; action: "delete" };

export async function POST(request: Request) {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orgId } = body;
  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const action = "action" in body && body.action ? body.action : "set_status";

  try {
    if (action === "set_status") {
      const status = (body as { status: string }).status;
      if (!status || !VALID_STATUSES.includes(status as OrgStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      await payload.update({ collection: "organizations", id: orgId, data: { status: status as OrgStatus } });
      return NextResponse.json({ success: true });
    }

    if (action === "set_fit_score") {
      const fitScore = (body as { fitScore: string | null }).fitScore;
      if (fitScore !== null && !VALID_FIT_SCORES.includes(fitScore as OrgFitScore)) {
        return NextResponse.json({ error: "Invalid fitScore" }, { status: 400 });
      }
      await payload.update({
        collection: "organizations",
        id: orgId,
        data: { fitScore: (fitScore ?? null) as OrgFitScore | null },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_pinned") {
      const org = await payload.findByID({ collection: "organizations", id: orgId });
      await payload.update({
        collection: "organizations",
        id: orgId,
        data: { pinned: !org.pinned },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      await payload.delete({ collection: "organizations", id: orgId });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
