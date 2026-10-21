import type { Payload } from "payload";
import { toCsv, csvBoolean, csvDate, type CsvColumn } from "@/lib/csv";
import { isSendable } from "@/lib/marketing";

/**
 * Shared client-export logic.
 *
 * The CSV route and the informational page both read from here, so the page can
 * describe the file without a second copy of the truth drifting out of step.
 */

/** Rows fetched per page. Kept well under Postgres parameter limits. */
export const PAGE_SIZE = 200;

/** Hard ceiling on pages, so a runaway query fails loudly instead of timing out. */
export const MAX_PAGES = 50;

/** Job statuses that do not represent an actual order. */
export const NON_ORDER_STATUSES = ["inquiry"];

/** Which clients the export includes. */
export type ExportFilter = "all" | "sendable";

/** The client fields the export reads. Keeps the query cheap. */
export interface ExportClient {
	id: number | string;
	email: string;
	first_name?: string | null;
	last_name?: string | null;
	marketing_consent?: boolean | null;
	consent_basis?: string | null;
	marketing_status?: string | null;
	marketing_status_changed_at?: string | null;
}

/** A client plus the derived values the columns need. */
export interface ExportRow {
	client: ExportClient;
	orders: number;
}

/** The shape `payload.auth` hands back, reused for the access-controlled reads. */
export type RequestUser = Parameters<Payload["find"]>[0]["user"];

/** Everything the page needs to describe, and the route needs to serialise. */
export interface ClientExportResult {
	filter: ExportFilter;
	columns: CsvColumn<ExportRow>[];
	rows: ExportRow[];
	totalClients: number;
	sendable: number;
	repeatCustomers: number;
	statusCounts: Record<string, number>;
}

/**
 * Normalise a filter query parameter. Anything unrecognised means "all", so a
 * malformed link still produces a usable file instead of a 400.
 *
 * @param value - raw `filter` parameter
 * @returns the resolved filter
 */
export function parseFilter(value: string | null | undefined): ExportFilter {
	return value === "sendable" ? "sendable" : "all";
}

/**
 * The download filename, dated so two exports in one day are distinguishable.
 *
 * @param date - export date
 * @returns `clients-brevo-YYYY-MM-DD.csv`
 */
export function exportFilename(date: Date = new Date()): string {
	return `clients-brevo-${date.toISOString().slice(0, 10)}.csv`;
}

/**
 * The CSV columns, in file order.
 *
 * Exported as data so the page can render the same list the file is built from.
 * Changing a column here changes both, together.
 */
export const EXPORT_COLUMNS: CsvColumn<ExportRow>[] = [
	{ header: "email", value: ({ client }) => client.email },
	{ header: "firstname", value: ({ client }) => client.first_name },
	{ header: "lastname", value: ({ client }) => client.last_name },
	{
		header: "consent_given",
		value: ({ client }) => csvBoolean(client.marketing_consent),
	},
	{ header: "consent_basis", value: ({ client }) => client.consent_basis },
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
 * @throws when the jobs read fails, so callers can report it rather than
 *         silently export everyone as a first-time customer
 */
export async function countOrdersByClient(
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
 * Reads every client, decorates it with its order count, and applies the filter.
 *
 * @param payload - Payload instance
 * @param user - authenticated user, passed through for access control
 * @param filter - "all" or "sendable"
 * @returns rows plus the counts the page displays
 * @throws when the job history cannot be read, or the client list exceeds the cap
 */
export async function loadClientExport(
	payload: Payload,
	user: RequestUser,
	filter: ExportFilter,
): Promise<ClientExportResult> {
	const orderCounts = await countOrdersByClient(payload, user);

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
			throw new Error(
				`Export exceeded ${MAX_PAGES * PAGE_SIZE} clients. Paginate the export before retrying.`,
			);
		}
		page += 1;
	}

	const allRows: ExportRow[] = clients.map((client) => ({
		client,
		orders: orderCounts.get(String(client.id)) ?? 0,
	}));

	const statusCounts: Record<string, number> = {};
	for (const { client } of allRows) {
		const key = client.marketing_status ?? "unknown";
		statusCounts[key] = (statusCounts[key] ?? 0) + 1;
	}

	return {
		filter,
		columns: EXPORT_COLUMNS,
		rows:
			filter === "sendable"
				? allRows.filter(({ client }) => isSendable(client))
				: allRows,
		totalClients: allRows.length,
		sendable: allRows.filter(({ client }) => isSendable(client)).length,
		repeatCustomers: allRows.filter(({ orders }) => orders > 1).length,
		statusCounts,
	};
}

/**
 * Serialise a loaded export to CSV text.
 *
 * @param result - output of {@link loadClientExport}
 * @returns RFC 4180 CSV with CRLF line endings
 */
export function buildCsv(result: ClientExportResult): string {
	return toCsv(result.columns, result.rows);
}
