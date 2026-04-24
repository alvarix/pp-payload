import { headers as getHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";

/** Parse semicolon-delimited Brevo CSV export */
function parseBrevoCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

const STATUS_RANK: Record<string, number> = {
  researched: 0,
  contacted: 1,
  responded: 2,
  meeting_scheduled: 3,
  upcoming_event: 4,
  ongoing_relationship: 5,
  past_collaborator: 6,
  no_response: 7,
  declined: 8,
};

/** Returns the status an org should be set to based on Brevo row data. */
function deriveStatus(
  row: Record<string, string>,
  currentStatus: string
): { status: string; note: string } {
  const hardBounce = row["Hard_Bounce_Date"];
  const unsubscribe = row["Unsubscribe_Date"];
  const opens = parseInt(row["Total Opens"] ?? "0", 10);
  const delivered = row["Delivered_Date"];

  if (unsubscribe) {
    return { status: "declined", note: `Unsubscribed ${unsubscribe}` };
  }
  if (hardBounce) {
    const reason = row["Hard_Bounce_Reason"] || "unknown";
    return {
      status: currentStatus,
      note: `Hard bounce ${hardBounce}: ${reason.slice(0, 120)}`,
    };
  }
  if (opens > 0) {
    const candidate = "responded";
    const shouldUpgrade =
      (STATUS_RANK[candidate] ?? 0) > (STATUS_RANK[currentStatus] ?? 0);
    return {
      status: shouldUpgrade ? candidate : currentStatus,
      note: `Opened email (${opens} open${opens > 1 ? "s" : ""}) on ${row["Open_Date"]}`,
    };
  }
  if (delivered) {
    const candidate = "contacted";
    const shouldUpgrade =
      (STATUS_RANK[candidate] ?? 0) > (STATUS_RANK[currentStatus] ?? 0);
    return {
      status: shouldUpgrade ? candidate : currentStatus,
      note: "",
    };
  }
  return { status: currentStatus, note: "" };
}

/**
 * POST /api/dashboard/brevo-org-import
 * Body: { csv: string, dryRun: boolean }
 * Matches orgs by Email_ID, updates status and outreach fields.
 */
export async function POST(request: Request) {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { csv, dryRun } = body as { csv: string; dryRun: boolean };

  if (!csv?.trim()) {
    return Response.json({ error: "No CSV content provided" }, { status: 400 });
  }

  const rows = parseBrevoCSV(csv);
  if (rows.length === 0) {
    return Response.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  const stats = {
    updated: 0,
    skipped: 0,
    notFound: 0,
    errors: [] as string[],
    rows: [] as {
      email: string;
      orgName: string;
      oldStatus: string;
      newStatus: string;
      note: string;
      action: string;
    }[],
  };

  for (const row of rows) {
    const email = row["Email_ID"] || "";
    if (!email) {
      stats.skipped++;
      continue;
    }

    const sendDate = row["Send_Date"] || "";

    try {
      const { docs } = await payload.find({
        collection: "organizations",
        where: { email: { equals: email } },
        limit: 1,
      });

      if (docs.length === 0) {
        stats.notFound++;
        stats.rows.push({
          email,
          orgName: "",
          oldStatus: "",
          newStatus: "",
          note: "",
          action: "not found",
        });
        continue;
      }

      const org = docs[0];
      const currentStatus = (org.status as string) || "researched";
      const { status: newStatus, note } = deriveStatus(row, currentStatus);

      const statusChanged = newStatus !== currentStatus;
      const rowSummary = {
        email,
        orgName: org.name as string,
        oldStatus: currentStatus,
        newStatus,
        note,
        action: "",
      };

      if (dryRun) {
        rowSummary.action = statusChanged ? `would update → ${newStatus}` : "no change";
        stats.rows.push(rowSummary);
        if (statusChanged) stats.updated++;
        continue;
      }

      const updateData: Record<string, unknown> = {};

      if (statusChanged) {
        updateData.status = newStatus;
      }

      // Set dateContacted from Send_Date if not already set
      if (!org.dateContacted && sendDate) {
        const [day, month, yearTime] = sendDate.split("-");
        if (day && month && yearTime) {
          const [year] = yearTime.split(" ");
          updateData.dateContacted = `${year}-${month}-${day}`;
        }
      }

      // Append note to responseNotes if there's something to add
      if (note) {
        const existing = (org.responseNotes as string) || "";
        updateData.responseNotes = existing ? `${existing}\n${note}` : note;
      }

      if (Object.keys(updateData).length > 0) {
        await payload.update({
          collection: "organizations",
          id: org.id,
          data: updateData as any,
        });
        rowSummary.action = statusChanged ? `updated → ${newStatus}` : "notes updated";
        stats.updated++;
      } else {
        rowSummary.action = "no change";
        stats.skipped++;
      }

      stats.rows.push(rowSummary);
    } catch (e: any) {
      stats.errors.push(`${email}: ${e.message}`);
    }
  }

  return Response.json({
    updated: stats.updated,
    skipped: stats.skipped,
    notFound: stats.notFound,
    errors: stats.errors,
    rows: stats.rows,
  });
}
