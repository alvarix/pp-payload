/**
 * Minimal RFC 4180 CSV serialization.
 *
 * Deliberately dumb: no BOM, no type coercion, no date formatting. The output
 * is consumed by the Brevo importer, so anything that makes the file friendlier
 * to Excel (BOM, formula escaping) risks making it wrong for Brevo instead.
 */

/** One output column: its header and how to read it from a source row. */
export interface CsvColumn<T> {
	/** Header cell text, written verbatim (escaped). */
	header: string;
	/** Extracts a cell value. Nullish becomes an empty cell. */
	value: (row: T) => string | null | undefined;
}

/**
 * Escape a single field per RFC 4180.
 *
 * Wraps in double quotes only when the value contains a comma, quote, CR, or
 * LF, and doubles any internal quote. Values without those characters are
 * emitted unchanged, which keeps emails and names readable in a plain editor.
 *
 * @param value - raw cell value
 * @returns the escaped cell
 */
export function escapeCsvField(value: string): string {
	if (/[",\r\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * Serialize rows to CSV text.
 *
 * Row order is whatever the caller passes; callers are expected to sort for
 * determinism. Line endings are CRLF and the output ends with a single CRLF,
 * so `wc -l` equals the row count (header included).
 *
 * @param columns - ordered column descriptors
 * @param rows - source records
 * @returns CSV text
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
	const lines: string[] = [columns.map((c) => escapeCsvField(c.header)).join(",")];

	for (const row of rows) {
		const cells = columns.map((column) => {
			const raw = column.value(row);
			return escapeCsvField(raw == null ? "" : raw);
		});
		lines.push(cells.join(","));
	}

	return `${lines.join("\r\n")}\r\n`;
}

/**
 * Render a date as a plain YYYY-MM-DD cell.
 *
 * Payload date fields arrive as full ISO timestamps. Date-only output keeps the
 * CSV readable in Brevo without inventing a locale-dependent format.
 *
 * @param value - ISO string, Date, or nullish
 * @returns YYYY-MM-DD, or an empty cell when absent or unparseable
 */
export function csvDate(value: string | Date | null | undefined): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().slice(0, 10);
}

/**
 * Render a boolean as a cell.
 *
 * Returns "false" for nullish input rather than an empty cell: for consent and
 * suppression columns, a blank is ambiguous while "false" is a statement.
 *
 * @param value - boolean or nullish
 * @returns "true" or "false"
 */
export function csvBoolean(value: boolean | null | undefined): string {
	return value === true ? "true" : "false";
}
