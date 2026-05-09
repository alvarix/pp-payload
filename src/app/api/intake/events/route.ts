import { getPayload } from "payload";
import configPromise from "@payload-config";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeSnapshot } from "@/lib/sanitizeSnapshot";
import { sendIntakeErrorAlert } from "@/lib/email";

const ALERT_TYPES = new Set(["submit_failed", "validation_blocked", "abandoned"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, sessionId, snapshot, error } = body;

    if (!sessionId || !type) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    const payload = await getPayload({ config: configPromise });
    const safeSnapshot = sanitizeSnapshot(snapshot);

    await payload.create({
      collection: "intake-events",
      data: {
        session_id: sessionId,
        event_type: type,
        form_snapshot: safeSnapshot,
        error_details: error ?? null,
        user_agent: request.headers.get("user-agent") ?? "",
        stripe_session_id: safeSnapshot?.stripe_checkout_session_id,
      },
    });

    if (ALERT_TYPES.has(type)) {
      // Dedupe: only email once per (sessionId, type). The row we just created
      // counts as 1 — if >1 rows exist for this combo, we've already sent.
      const prior = await payload.find({
        collection: "intake-events",
        where: {
          and: [
            { session_id: { equals: sessionId } },
            { event_type: { equals: type } },
          ],
        },
        limit: 2,
      });
      if (prior.docs.length <= 1) {
        await sendIntakeErrorAlert({ type, sessionId, snapshot: safeSnapshot, error });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("intake events endpoint failed:", err);
    // Never surface telemetry errors to the form.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
