import { headers as getHeaders } from "next/headers";
import { getPayload, type Payload } from "payload";
import config from "@/payload.config";
import { toCsv, csvBoolean, csvDate, type CsvColumn } from "@/lib/csv";
import { isSendable } from "@/lib/marketing";

/** Rows fetched per page. Kept well under Postgres parameter limits. */
const PAGE_SIZE = 200;

/**
 * Hard ceiling on pages fetched, so a runaway query fails loudly instead of
 * hanging until the serverless timeout. 50 * 200 = 10,000 rows.
 */
const MAX_PAGES = 50;

/** Job statuses that do not represent an actual order. */
const NON_ORDER_STATUSES = ["inquiry"];

/** The client fields the export reads. Keeps the query cheap. */
interface ExportClient {
	id: number | string;
	email: string;
	first_name?: string | null;
	last_name?: string | null;
	marketing_consent?: boolean | null;
	consent_basis?: string | null;
	marketing_status?: string | null;
	marketing_status_changed_at?: string | null;
}

/** The shape `payload.auth` hands back, reused for the access-controlled reads. */
type RequestUser = Parameters<Payload["find"]>[0]["user"];

/**
 * Counts non-inquiry jobs per client.
 *
 * One paginated pass over jobs, grouped in memory by client id. Avoids the
 * `jobs` join field on Clients, which would hydrate full job documents for
 * every client just to produce a number.
 *
 * @param payload - Payload instance
 * @param user - authenticated user, passed through for access control
 * @returns map of client id to order count
 */
async function countOrdersByClient(
	payload: Payload,
	user: RequestUser,
): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	let page = 1;

	for (;;) {
		const result = await payload.find({
			collection: "jobs",
			user,
			overrideAccess: false,
			depth: 0,
			limit: PAGE_SIZE,
			page,
			select: { client: true, status: true },
			where: {
				and: [
					{ client: { exists: true } },
					{ status: { not_in: NON_ORDER_STATUSES } },
				],
			},
		});

		for (const job of result.docs) {
			const client = (job as { client?: unknown }).client;
			// At depth 0 the relationship is an id; guard anyway in case depth changes.
			const id =
				typeof client === "object" && client !== null
					? (client as { id?: unknown }).id
					: client;
			if (id == null) continue;
			const key = String(id);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}

		if (!result.hasNextPage || page >= MAX_PAGES) break;
		page += 1;
	}

	return counts;
}

/**
 * Portable ICU-decimal-safe filename date.
 * @param date - the export date
 * @returns YYYY-MM-DD
 */
function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Reads the export filter from the request URL.
 *
 * A malformed URL never fails the download; it falls back to "all", because
 * failing here would be a confusing 500 for a user who just clicked a link.
 *
 * @param request - incoming request
 * @returns "sendable" when the caller asked for consenting, non-unsubscribed clients
 */
function parseFilter(request: Request): "all" | "sendable" {
	try {
		return new URL(request.url).searchParams.get("filter") === "sendable"
			? "sendable"
			: "all";
	} catch {
		return "all";
	}
}

/**
 * GET /api/dashboard/export/clients
 *
 * Streams a Brevo-shaped client export as a CSV download.
 *
 * Query params:
 *   filter=sendable - only clients eligible for marketing email.
 *
 * Columns: email, firstname, lastname, consent_given, marketing_status,
 * marketing_status_changed_at, repeat_customer.
 */
export async function GET(request: Request) {
	const headers = await getHeaders();
	const payloadConfig = await config;
	const payload = await getPayload({ config: payloadConfig });

	const { user } = await payload.auth({ headers });
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const filter = parseFilter(request);

	let orderCounts: Map<string, number>;
	try {
		orderCounts = await countOrdersByClient(payload, user);
	} catch (e) {
		return Response.json(
			{ error: `Could not read job history: ${(e as Error).message}` },
			{ status: 500 },
		);
	}

	// Collect clients first so header counts are exact.
	const clients: ExportClient[] = [];
	let page = 1;

	for (;;) {
		const result = await payload.find({
			collection: "clients",
			user,
			overrideAccess: false,
			depth: 0,
			limit: PAGE_SIZE,
			page,
			sort: "email",
			select: {
				email: true,
				first_name: true,
				last_name: true,
				marketing_consent: true,
				consent_basis: true,
				marketing_status: true,
				marketing_status_changed_at: true,
			},
		});

		clients.push(...result.docs);

		if (!result.hasNextPage) break;
		if (page >= MAX_PAGES) {
			return Response.json(
				{
					error: `Export exceeded ${MAX_PAGES * PAGE_SIZE} clients. Paginate the export before retrying.`,
				},
				{ status: 500 },
			);
		}
		page += 1;
	}

	const allRows = clients.map((client) => ({
		client,
		orders: orderCounts.get(String(client.id)) ?? 0,
	}));

	const totalClients = allRows.length;
	const sendable = allRows.filter(({ client }) => isSendable(client)).length;

	const rows =
		filter === "sendable"
			? allRows.filter(({ client }) => isSendable(client))
			: allRows;

	const columns: CsvColumn<(typeof rows)[number]>[] = [
		{ header: "email", value: ({ client }) => client.email },
		{ header: "firstname", value: ({ client }) => client.first_name },
		{ header: "lastname", value: ({ client }) => client.last_name },
		{
			header: "consent_given",
			value: ({ client }) => csvBoolean(client.marketing_consent),
		},
		{
			header: "consent_basis",
			value: ({ client }) => client.consent_basis,
		},
		{
			header: "marketing_status",
			value: ({ client }) => client.marketing_status,
		},
		{
			header: "marketing_status_changed_at",
			value: ({ client }) => csvDate(client.marketing_status_changed_at),
		},
		{
			header: "repeat_customer",
			value: ({ orders }) => csvBoolean(orders > 1),
		},
	];

	const csv = toCsv(columns, rows);
	const filename = `clients-brevo-${isoDate(new Date())}.csv`;

	return new Response(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
			"X-Total-Clients": String(totalClients),
			"X-Sendable-Clients": String(sendable),
		},
	});
}
