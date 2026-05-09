import { test, expect } from "@playwright/test";

const INTAKE_URL = "http://localhost:3000/intake";

/**
 * Creates a fake oversized file for photo input testing.
 * The file object is injected into the input via the Playwright API.
 */
async function attachOversizedPhoto(page: import("@playwright/test").Page) {
  const fileInput = page.locator('input[name="pet_pics"]').first();
  // Set files via Playwright buffer — 11MB synthetic file exceeds 10MB per-file limit.
  await fileInput.setInputFiles({
    name: "huge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(11 * 1024 * 1024, 0),
  });
}

test.describe("intake error capture", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage and sessionStorage before each test.
    await page.goto(INTAKE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test("draft persists across page refresh", async ({ page }) => {
    await page.goto(INTAKE_URL);
    await page.fill('input[name="first_name"]', "Pixel");
    await page.fill('input[name="email"]', "pixel@example.com");
    await page.fill('input[name="pet_name"]', "Noodle");

    // Wait for 500ms debounce to flush draft to localStorage.
    await page.waitForTimeout(700);

    await page.reload();

    // Values should be restored from localStorage draft.
    await expect(page.locator('input[name="first_name"]')).toHaveValue("Pixel");
    await expect(page.locator('input[name="email"]')).toHaveValue("pixel@example.com");
    await expect(page.locator('input[name="pet_name"]')).toHaveValue("Noodle");
  });

  test("shows partial submit CTA when photos are oversized", async ({ page }) => {
    await page.goto(INTAKE_URL);
    await attachOversizedPhoto(page);

    await expect(page.locator('button:has-text("Submit without photos")')).toBeVisible();
    await expect(page.locator('a[href*="instagram.com/alvar.nyc"]')).toBeVisible();
    await expect(page.locator('a[href*="mailto:alvar@petportraits.ink"]')).toBeVisible();
  });

  test("mailto subject includes pet name when filled", async ({ page }) => {
    await page.goto(INTAKE_URL);
    await page.fill('input[name="pet_name"]', "Mochi");
    await attachOversizedPhoto(page);

    const mailtoHref = await page.locator('a[href*="mailto:alvar@petportraits.ink"]').getAttribute("href");
    expect(mailtoHref).toContain("Photos%20for%20Mochi");
  });

  test("submit_failed event sent when POST returns 500", async ({ page }) => {
    const eventRequests: string[] = [];

    // Intercept events endpoint to record calls.
    await page.route("/api/intake/events", async (route) => {
      const body = JSON.parse((await route.request().postData()) ?? "{}");
      eventRequests.push(body.type);
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    // Force intake POST to fail.
    await page.route("/api/intake", (route) => {
      route.fulfill({ status: 500, body: JSON.stringify({ error: "server error" }) });
    });

    await page.goto(INTAKE_URL);
    await page.fill('input[name="first_name"]', "Pixel");
    await page.fill('input[name="last_name"]', "Cat");
    await page.fill('input[name="email"]', "pixel@example.com");
    await page.fill('input[name="pet_name"]', "Noodle");

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);

    expect(eventRequests).toContain("submit_failed");
  });

  test("validation_blocked event sent after 30s with photo error", async ({ page }) => {
    const eventRequests: string[] = [];

    await page.route("/api/intake/events", async (route) => {
      const body = JSON.parse((await route.request().postData()) ?? "{}");
      eventRequests.push(body.type);
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(INTAKE_URL);
    await attachOversizedPhoto(page);

    // Fast-forward 30s using Playwright's clock API.
    await page.clock.fastForward(31_000);
    await page.waitForTimeout(200);

    expect(eventRequests).toContain("validation_blocked");
  });

  test("validation_blocked fires only once per session with repeated errors", async ({ page }) => {
    const validationBlockedCount = { n: 0 };

    await page.route("/api/intake/events", async (route) => {
      const body = JSON.parse((await route.request().postData()) ?? "{}");
      if (body.type === "validation_blocked") validationBlockedCount.n++;
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(INTAKE_URL);
    await attachOversizedPhoto(page);
    await page.clock.fastForward(31_000);
    await page.waitForTimeout(200);
    // Trigger again — should not fire a second time (flag is set).
    await page.clock.fastForward(31_000);
    await page.waitForTimeout(200);

    expect(validationBlockedCount.n).toBe(1);
  });

  test("localStorage draft cleared after successful submit", async ({ page }) => {
    // Stub intake to succeed.
    await page.route("/api/intake", (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ success: true, jobId: 99 }) });
    });

    await page.goto(INTAKE_URL);
    await page.fill('input[name="first_name"]', "Pixel");
    await page.fill('input[name="email"]', "pixel@example.com");
    await page.fill('input[name="pet_name"]', "Noodle");
    await page.fill('input[name="last_name"]', "Cat");
    await page.waitForTimeout(700);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);

    const draft = await page.evaluate(() => localStorage.getItem("intake_draft"));
    expect(draft).toBeNull();
  });
});
