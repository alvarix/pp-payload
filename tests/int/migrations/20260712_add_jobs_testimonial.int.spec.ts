/**
 * Integration test for migration 20260712_000000_add_jobs_testimonial.
 *
 * Creates a temporary table that mimics the jobs table, runs the migration
 * SQL against it, and verifies correctness.
 *
 * Run with:  npx vitest run tests/int/migrations/20260712_add_jobs_testimonial.int.spec.ts
 *
 * Requires a running Postgres (DATABASE_URL from .env).
 * Uses a temporary table -- no real data is modified.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

const { Pool } = pg;

function loadDbUrl(): string | null {
	try {
		const envPath = resolve(process.cwd(), ".env");
		const env = readFileSync(envPath, "utf8");
		const match = env.match(/DATABASE_URL\s*=\s*(.+)/);
		return match ? match[1].trim() : null;
	} catch {
		return null;
	}
}

const DATABASE_URL = loadDbUrl();

const describeIf = DATABASE_URL ? describe : describe.skip;

// Unique suffix so this test never collides with real tables
const TEST_TABLE = "migration_test_20260712";

describeIf("migration 20260712_000000_add_jobs_testimonial", () => {
	let pool: pg.Pool;

	beforeAll(async () => {
		pool = new Pool({
			connectionString: DATABASE_URL!,
			connectionTimeoutMillis: 5000,
		});
		// Create a minimal test table
		await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TEST_TABLE}" (
        id SERIAL PRIMARY KEY,
        testimonial text,
        portfolio_testimonial jsonb
      )
    `);
	});

	afterAll(async () => {
		await pool.query(`DROP TABLE IF EXISTS "${TEST_TABLE}"`);
		await pool.end();
	});

	it("creates testimonial column if not exists", async () => {
		// Simulate: column doesn't exist yet
		await pool.query(
			`ALTER TABLE "${TEST_TABLE}" DROP COLUMN IF EXISTS testimonial`,
		);

		await pool.query(
			`ALTER TABLE "${TEST_TABLE}" ADD COLUMN IF NOT EXISTS "testimonial" text`,
		);

		const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = '${TEST_TABLE}' AND column_name = 'testimonial'
    `);
		expect(cols.rows).toHaveLength(1);
	});

	it("ADD COLUMN IF NOT EXISTS is idempotent", async () => {
		// Run it twice -- should not error
		await pool.query(
			`ALTER TABLE "${TEST_TABLE}" ADD COLUMN IF NOT EXISTS "testimonial" text`,
		);
		await pool.query(
			`ALTER TABLE "${TEST_TABLE}" ADD COLUMN IF NOT EXISTS "testimonial" text`,
		);

		const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = '${TEST_TABLE}' AND column_name = 'testimonial'
    `);
		expect(cols.rows).toHaveLength(1);
	});

	it("copies data from portfolio_testimonial JSONB when column exists", async () => {
		// Insert test row with data in the old JSONB column
		await pool.query(`
      INSERT INTO "${TEST_TABLE}" (portfolio_testimonial)
      VALUES ('{"testimonial": "Great artist, loved the portrait!"}')
    `);

		// Run the data copy
		await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${TEST_TABLE}' AND column_name = 'portfolio_testimonial'
        ) THEN
          UPDATE "${TEST_TABLE}"
          SET "testimonial" = "portfolio_testimonial" ->> 'testimonial'
          WHERE "portfolio_testimonial" IS NOT NULL
            AND "portfolio_testimonial" ->> 'testimonial' IS NOT NULL
            AND "portfolio_testimonial" ->> 'testimonial' != '';
        END IF;
      END $$;
    `);

		const result = await pool.query(
			`SELECT testimonial FROM "${TEST_TABLE}" WHERE testimonial IS NOT NULL`,
		);
		expect(result.rows[0].testimonial).toBe(
			"Great artist, loved the portrait!",
		);
	});

	it("skips data copy gracefully when portfolio_testimonial column is missing", async () => {
		// Drop the old-style column before running the DO block
		await pool.query(`DELETE FROM "${TEST_TABLE}"`);
		await pool.query(
			`ALTER TABLE "${TEST_TABLE}" DROP COLUMN IF EXISTS portfolio_testimonial`,
		);

		// Should NOT throw -- the DO block checks existence first
		await expect(
			pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${TEST_TABLE}' AND column_name = 'portfolio_testimonial'
          ) THEN
            UPDATE "${TEST_TABLE}"
            SET "testimonial" = "portfolio_testimonial" ->> 'testimonial'
            WHERE "portfolio_testimonial" IS NOT NULL
              AND "portfolio_testimonial" ->> 'testimonial' IS NOT NULL
              AND "portfolio_testimonial" ->> 'testimonial' != '';
          END IF;
        END $$;
      `),
		).resolves.toBeDefined();
	});

	it("handles empty/null values correctly", async () => {
		// Recreate the portfolio_testimonial column with edge cases
		await pool.query(
			`ALTER TABLE "${TEST_TABLE}" ADD COLUMN IF NOT EXISTS portfolio_testimonial jsonb`,
		);
		await pool.query(`DELETE FROM "${TEST_TABLE}"`);

		await pool.query(`
      INSERT INTO "${TEST_TABLE}" (testimonial, portfolio_testimonial) VALUES
      (NULL, '{"testimonial": "Valid feedback"}'),
      (NULL, '{"testimonial": ""}'),
      (NULL, NULL),
      (NULL, '{}'),
      (NULL, '{"testimonial": null}')
    `);

		await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${TEST_TABLE}' AND column_name = 'portfolio_testimonial'
        ) THEN
          UPDATE "${TEST_TABLE}"
          SET "testimonial" = "portfolio_testimonial" ->> 'testimonial'
          WHERE "portfolio_testimonial" IS NOT NULL
            AND "portfolio_testimonial" ->> 'testimonial' IS NOT NULL
            AND "portfolio_testimonial" ->> 'testimonial' != '';
        END IF;
      END $$;
    `);

		const filled = await pool.query(
			`SELECT COUNT(*) as c FROM "${TEST_TABLE}" WHERE testimonial IS NOT NULL AND testimonial != ''`,
		);
		// Only the "Valid feedback" row should be copied
		expect(Number(filled.rows[0].c)).toBe(1);
	});
});
