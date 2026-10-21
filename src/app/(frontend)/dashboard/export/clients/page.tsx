export const metadata = { title: "Export for Brevo" };

import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";

import {
	exportFilename,
	loadClientExport,
	parseFilter,
} from "@/lib/client-export";
import { AutoDownload } from "./AutoDownload";

/** The endpoint the download button points at. */
const ENDPOINT = "/api/dashboard/export/clients";

/**
 * Describes the export and starts the CSV download.
 *
 * Every value on this page is read from `loadClientExport`, the same function
 * the CSV route uses, so the page cannot describe a file different from the one
 * it downloads.
 *
 * Query params:
 *   filter=sendable - describe and download only marketing-eligible clients.
 */
export default async function ExportClientsPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: string }>;
}) {
	const headers = await getHeaders();
	const payloadConfig = await config;
	const payload = await getPayload({ config: payloadConfig });
	const { user } = await payload.auth({ headers });
	if (!user) redirect("/admin/login");

	const params = await searchParams;
	const filter = parseFilter(params.filter);
	const href = filter === "sendable" ? `${ENDPOINT}?filter=sendable` : ENDPOINT;

	let result;
	try {
		result = await loadClientExport(payload, user, filter);
	} catch (e) {
		return (
			<div className="p-6 max-w-3xl">
				<h1 className="text-lg font-semibold text-gray-900 mb-2">
					Export failed
				</h1>
				<p className="text-xs text-red-700">
					{(e as Error).message}
				</p>
				<p className="text-xs text-gray-600 mt-3">
					Nothing was downloaded. Fix the cause above and reload this page.
				</p>
			</div>
		);
	}

	const suppressed = result.totalClients - result.sendable;
	const sample = result.rows[0];
	const filename = exportFilename();

	return (
		<div className="min-h-screen bg-gray-50 px-4 py-6">
			<div className="max-w-3xl mx-auto">
				<AutoDownload href={href} />

				<div className="flex items-baseline justify-between mb-1">
					<h1 className="text-lg font-semibold text-gray-900">
						Export for Brevo
					</h1>
					<a
						href="/dashboard"
						className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
					>
						Back to dashboard
					</a>
				</div>
				<p className="text-xs text-gray-600 mb-4">
					The download starts automatically. Every value below is read from the
					same function that builds the file.
				</p>

				{/* Primary action, also the fallback when a browser blocks the auto-download */}
				<div className="flex flex-wrap items-center gap-2 mb-5">
					<a
						href={href}
						className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded font-semibold hover:bg-gray-900"
					>
						Download {filename}
					</a>
					<a
						href={filter === "sendable" ? "/dashboard/export/clients" : "?filter=sendable"}
						className="text-xs px-2 py-1.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
					>
						{filter === "sendable"
							? "Show all clients instead"
							: "Only marketing-eligible clients"}
					</a>
				</div>

				{/* Counts */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
					{[
						{ label: "Clients", value: result.totalClients },
						{ label: "Eligible to send", value: result.sendable },
						{ label: "Not sendable", value: suppressed },
						{ label: "Repeat customers", value: result.repeatCustomers },
					].map((stat) => (
						<div
							key={stat.label}
							className="bg-white border border-gray-200 rounded px-3 py-2"
						>
							<div className="text-base font-semibold text-gray-900">
								{stat.value}
							</div>
							<div className="text-xs text-gray-500">{stat.label}</div>
						</div>
					))}
				</div>

				{/* Exact parameters */}
				<h2 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">
					Exact parameters
				</h2>
				<table className="w-full text-xs mb-5 bg-white border border-gray-200 rounded">
					<tbody>
						{[
							["Endpoint", href],
							["Filter", filter === "sendable" ? "sendable" : "all"],
							["Sort order", "email, ascending, case-sensitive (Postgres default)"],
							["Rows in file", `${result.rows.length} data rows + 1 header`],
							["Filename", filename],
							["Content-Type", "text/csv; charset=utf-8"],
							["Encoding", "UTF-8, no BOM"],
							["Line endings", "CRLF"],
							["Quoting", "RFC 4180 — quotes doubled, fields wrapped when they contain , \" CR or LF"],
							["Cache", "no-store"],
							[
								"Status filter",
								"sendable = marketing_consent true AND marketing_status = 'subscribed'",
							],
						].map(([label, value]) => (
							<tr key={label} className="border-b border-gray-100 last:border-0">
								<td className="px-3 py-1.5 text-gray-500 align-top w-1/3">
									{label}
								</td>
								<td className="px-3 py-1.5 text-gray-900 font-mono break-all">
									{value}
								</td>
							</tr>
						))}
					</tbody>
				</table>

				{/* Columns, with one real sample value */}
				<h2 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">
					Columns
				</h2>
				<table className="w-full text-xs mb-5 bg-white border border-gray-200 rounded">
					<thead>
						<tr className="border-b border-gray-200 text-left text-gray-500">
							<th className="px-3 py-1.5 font-medium">Header</th>
							<th className="px-3 py-1.5 font-medium">Sample value</th>
						</tr>
					</thead>
					<tbody>
						{result.columns.map((column) => (
							<tr key={column.header} className="border-b border-gray-100 last:border-0">
								<td className="px-3 py-1.5 font-mono text-gray-900">
									{column.header}
								</td>
								<td className="px-3 py-1.5 font-mono text-gray-600">
									{sample ? (column.value(sample) ?? "") || "—" : "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>

				{/* Status breakdown */}
				<h2 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">
					Marketing status breakdown
				</h2>
				<table className="w-full text-xs mb-5 bg-white border border-gray-200 rounded">
					<tbody>
						{Object.entries(result.statusCounts)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([status, count]) => (
								<tr key={status} className="border-b border-gray-100 last:border-0">
									<td className="px-3 py-1.5 font-mono text-gray-900 w-1/3">
										{status}
									</td>
									<td className="px-3 py-1.5 text-gray-600">{count}</td>
								</tr>
							))}
					</tbody>
				</table>

				<p className="text-xs text-gray-600">
					In Brevo, create <span className="font-mono">consent_given</span>,{" "}
					<span className="font-mono">consent_basis</span>,{" "}
					<span className="font-mono">marketing_status</span>,{" "}
					<span className="font-mono">marketing_status_changed_at</span> and{" "}
					<span className="font-mono">repeat_customer</span> as{" "}
					<strong>text</strong> attributes — Brevo has no boolean or date
					attribute type, and text filters cleanly in segments. Import into a
					test list first; never send from the import.
				</p>
			</div>
		</div>
	);
}
