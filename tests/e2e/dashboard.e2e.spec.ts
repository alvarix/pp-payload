import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("unauthenticated visit redirects to /admin/login", async ({ page }) => {
    const response = await page.goto("http://localhost:3000/dashboard");
    // Should redirect to login page
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  // TODO: authenticated tests require a test user setup
  // test('authenticated user sees dashboard with stats bar', async ({ page }) => {
  //   // 1. Log in via Payload admin
  //   // 2. Navigate to /dashboard
  //   // 3. Expect heading "Dashboard"
  //   // 4. Expect stats bar to be visible
  // });

  // TODO: test quick action buttons
  // test('clicking "Start Work" changes job status', async ({ page }) => {
  //   // 1. Log in, navigate to /dashboard
  //   // 2. Find a job card in "Intake Received" column
  //   // 3. Click "Start Work"
  //   // 4. Expect card to move to "In Progress" column
  // });
});
