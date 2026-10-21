import { headers as getHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
	buildCsv,
	exportFilename,
	loadClientExport,
	parseFilter,
	type ExportFilter,
} from "@/lib/client-export";

/**
 * Reads the export filter from the request URL.
 *
 * A malformed URL never fails the download; it falls back to "all", because
 * failing here would be a confusing 500 for a user who just clicked a link.
 *
 * @param request - incoming request
 * @returns the resolved filter
 */
function filterFrom(request: Request): ExportFilter {
	try {
		return parseFilter(new URL(request.url).searchParams.get("filter"));
	} catch {
		return "all";
	}
}

/**
 * GET /api/dashboard/export/clients
 *
 * Downloads a Brevo-shaped client export as CSV.
 *
 * Query params:
 *   filter=sendable - only clients eligible for marketing email.
 *
 * Header of the file: email, firstname, lastname, consent_given, consent_basis,
 * marketing_status, marketing_status_changed_at, repeat_customer.
 */
export async function GET(request: Request) {
	const headers = await getHeaders();
	const payloadConfig = await config;
	const payload = await getPayload({ config: payloadConfig });

	const { user } = await payload.auth({ headers });
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let result;
	try {
		result = await loadClientExport(payload, user, filterFrom(request));
	} catch (e) {
		return Response.json(
			{ error: `Export failed: ${(e as Error).message}` },
			{ status: 500 },
		);
	}

	const csv = buildCsv(result);

	return new Response(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${exportFilename()}"`,
			"Cache-Control": "no-store",
			"X-Total-Clients": String(result.totalClients),
			"X-Sendable-Clients": String(result.sendable),
			"X-Rows-Exported": String(result.rows.length),
		},
	});
}
