/**
 * Unit tests for RFC 4180 CSV serialization.
 *
 * The export is consumed by Brevo's importer, so the contract these tests pin
 * down is byte-level: exact quoting, exact line endings, no BOM.
 */

import { describe, it, expect } from "vitest";
import { toCsv, escapeCsvField, csvBoolean, csvDate, type CsvColumn } from "@/lib/csv";

interface Row {
	email: string;
	name?: string | null;
	flag?: boolean | null;
}

/** Two-column fixture used by most cases below. */
const columns: CsvColumn<Row>[] = [
	{ header: "email", value: (row) => row.email },
	{ header: "name", value: (row) => row.name },
];

describe("escapeCsvField", () => {
	it("leaves plain values untouched", () => {
		expect(escapeCsvField("someone@example.com")).toBe("someone@example.com");
	});

	it("quotes values containing a comma", () => {
		expect(escapeCsvField("O'Brien, Jr.")).toBe('"O\'Brien, Jr."');
	});

	it("doubles internal quotes and wraps the field", () => {
		expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
	});

	it("quotes values containing a newline", () => {
		expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
	});

	it("quotes values containing a carriage return", () => {
		expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
	});

	it("does not quote a leading equals sign", () => {
		// Formula injection is intentionally not neutralised: prefixing an
		// apostrophe would corrupt the Brevo import.
		expect(escapeCsvField("=SUM(A1)")).toBe("=SUM(A1)");
	});
});

describe("csvBoolean", () => {
	it("renders true", () => {
		expect(csvBoolean(true)).toBe("true");
	});

	it("renders false", () => {
		expect(csvBoolean(false)).toBe("false");
	});

	it("renders false for nullish rather than blank", () => {
		expect(csvBoolean(null)).toBe("false");
		expect(csvBoolean(undefined)).toBe("false");
	});
});

describe("csvDate", () => {
	it("reduces an ISO timestamp to a date", () => {
		expect(csvDate("2026-10-21T14:32:11.000Z")).toBe("2026-10-21");
	});

	it("accepts a Date", () => {
		expect(csvDate(new Date("2026-10-21T14:32:11.000Z"))).toBe("2026-10-21");
	});

	it("returns an empty cell for nullish", () => {
		expect(csvDate(null)).toBe("");
		expect(csvDate(undefined)).toBe("");
	});

	it("returns an empty cell for an unparseable string", () => {
		expect(csvDate("not a date")).toBe("");
	});
});

describe("toCsv", () => {
	it("writes header, rows, CRLF line endings and a trailing newline", () => {
		const csv = toCsv(columns, [{ email: "a@example.com", name: "A" }]);
		expect(csv).toBe("email,name\r\na@example.com,A\r\n");
	});

	it("emits headers only for an empty row set", () => {
		expect(toCsv(columns, [])).toBe("email,name\r\n");
	});

	it("writes an empty cell for null and undefined", () => {
		const csv = toCsv(columns, [{ email: "a@example.com", name: null }]);
		expect(csv).toBe("email,name\r\na@example.com,\r\n");
	});

	it("keeps one physical line per row when a value contains a newline", () => {
		const csv = toCsv(columns, [
			{ email: "a@example.com", name: "two\nlines" },
			{ email: "b@example.com", name: "B" },
		]);
		const lines = csv.split("\r\n").filter(Boolean);
		expect(lines).toHaveLength(3);
		expect(lines[1]).toBe('a@example.com,"two\nlines"');
	});

	it("does not emit a UTF-8 BOM", () => {
		const csv = toCsv(columns, [{ email: "a@example.com" }]);
		expect(csv.charCodeAt(0)).toBe("e".charCodeAt(0));
	});

	it("preserves accented characters as UTF-8", () => {
		const csv = toCsv(columns, [{ email: "a@example.com", name: "Zoë Ångström" }]);
		expect(csv).toContain("Zoë Ångström");
	});

	it("is deterministic for identical input", () => {
		const rows: Row[] = [{ email: "b@example.com" }, { email: "a@example.com" }];
		expect(toCsv(columns, rows)).toBe(toCsv(columns, rows));
	});

	it("renders a false boolean through a column value function", () => {
		const flagColumns: CsvColumn<Row>[] = [
			{ header: "email", value: (row) => row.email },
			{ header: "flag", value: (row) => csvBoolean(row.flag) },
		];
		expect(toCsv(flagColumns, [{ email: "a@example.com", flag: false }])).toBe(
			"email,flag\r\na@example.com,false\r\n",
		);
	});
});
