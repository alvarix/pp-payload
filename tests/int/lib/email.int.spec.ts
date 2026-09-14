/**
 * Unit tests for intake notification email functions.
 * Tests email body formatting, subject lines, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally for Brevo API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env var
process.env.BREVO_API_KEY = "test-key";

import { sendIntakeNotification, sendPosIntakeNotification } from "@/lib/email";

beforeEach(() => {
	mockFetch.mockReset();
	mockFetch.mockResolvedValue({ ok: true });
});

function getSentTextContent(): string {
	const call = mockFetch.mock.calls[0];
	const body = JSON.parse(call[1].body);
	return body.textContent;
}

function getSentSubject(): string {
	const call = mockFetch.mock.calls[0];
	const body = JSON.parse(call[1].body);
	return body.subject;
}

function getSentHtmlContent(): string {
	const call = mockFetch.mock.calls[0];
	const body = JSON.parse(call[1].body);
	return body.htmlContent;
}

describe("sendIntakeNotification", () => {
	it("includes job type when street", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			jobType: "street",
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:   Street");
	});

	it("includes job type when studio", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			jobType: "studio",
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:   Studio");
	});

	it("shows (not set) when jobType is null", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			jobType: null,
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:   (not set)");
	});

	it("shows (not set) when jobType is undefined", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:   (not set)");
	});

	it("includes pet photo URLs", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			petPicUrls: [
				"https://example.com/pic1.jpg",
				"https://example.com/pic2.jpg",
			],
		});

		const text = getSentTextContent();
		expect(text).toContain("Pet Photos:");
		expect(text).toContain("1. https://example.com/pic1.jpg");
		expect(text).toContain("2. https://example.com/pic2.jpg");
	});

	it("converts relative pet photo URLs to absolute", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			petPicUrls: [
				"/api/media/file/pic1.png",
				"https://example.com/pic2.jpg",
			],
		});

		const text = getSentTextContent();
		expect(text).toContain(
			"1. https://portal.petportraits.ink/api/media/file/pic1.png",
		);
		expect(text).toContain("2. https://example.com/pic2.jpg");
	});

	it("renders pet photos as HTML images after the links", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			petPicUrls: ["/api/media/file/pic1.png"],
		});

		const html = getSentHtmlContent();
		expect(html).toContain(
			'<img src="https://portal.petportraits.ink/api/media/file/pic1.png"',
		);
		// Images come after the text and the record link
		expect(html.indexOf("View record")).toBeLessThan(html.indexOf("<img"));
	});

	it("omits HTML images when there are no pet photos", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
		});

		const html = getSentHtmlContent();
		expect(html).not.toContain("<img");
		expect(html).not.toContain("Photo previews");
	});

	it("omits Pet Photos section when URLs array is empty", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			petPicUrls: [],
		});

		const text = getSentTextContent();
		expect(text).not.toContain("Pet Photos:");
	});

	it("omits Pet Photos section when URLs is undefined", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
		});

		const text = getSentTextContent();
		expect(text).not.toContain("Pet Photos:");
	});

	it("prefixes subject with [partial] for partial submissions", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
			partial: true,
		});

		expect(getSentSubject()).toContain("[partial]");
	});

	it("includes job record link", async () => {
		await sendIntakeNotification({
			clientName: "Jane Doe",
			email: "jane@example.com",
			petName: "Buddy",
			jobId: 42,
		});

		const text = getSentTextContent();
		expect(text).toContain("portal.petportraits.ink/admin/collections/jobs/42");
	});

	it("handles full intake with all fields", async () => {
		await sendIntakeNotification({
			clientName: "John Smith",
			email: "john@example.com",
			petName: "Luna",
			jobId: 99,
			jobType: "studio",
			petPicUrls: ["https://cdn.example.com/photo.png"],
		});

		const text = getSentTextContent();
		expect(text).toContain("Client: John Smith");
		expect(text).toContain("Email:  john@example.com");
		expect(text).toContain("Pet:    Luna");
		expect(text).toContain("Type:   Studio");
		expect(text).toContain("Pet Photos:");
		expect(text).toContain("1. https://cdn.example.com/photo.png");
		expect(text).toContain("jobs/99");
	});
});

describe("sendPosIntakeNotification", () => {
	it("includes job type when street", async () => {
		await sendPosIntakeNotification({
			email: "pos@example.com",
			jobId: 10,
			amountCents: 5000,
			paymentIntentId: "pi_test",
			jobType: "street",
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:              Street");
	});

	it("includes job type when studio", async () => {
		await sendPosIntakeNotification({
			email: "pos@example.com",
			jobId: 10,
			amountCents: 5000,
			paymentIntentId: "pi_test",
			jobType: "studio",
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:              Studio");
	});

	it("shows (not set) when jobType is null", async () => {
		await sendPosIntakeNotification({
			email: "pos@example.com",
			jobId: 10,
			amountCents: 5000,
			paymentIntentId: "pi_test",
			jobType: null,
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:              (not set)");
	});

	it("shows (not set) when jobType is undefined", async () => {
		await sendPosIntakeNotification({
			email: "pos@example.com",
			jobId: 10,
			amountCents: 5000,
			paymentIntentId: "pi_test",
		});

		const text = getSentTextContent();
		expect(text).toContain("Type:              (not set)");
	});

	it("includes amount in dollars", async () => {
		await sendPosIntakeNotification({
			email: "pos@example.com",
			jobId: 10,
			amountCents: 9999,
			paymentIntentId: "pi_test",
		});

		const text = getSentTextContent();
		expect(text).toContain("$99.99");
	});

	it("prefixes subject with [POS]", async () => {
		await sendPosIntakeNotification({
			email: "pos@example.com",
			jobId: 10,
			amountCents: 5000,
			paymentIntentId: "pi_test",
		});

		expect(getSentSubject()).toContain("[POS]");
		expect(getSentSubject()).toContain("$50.00");
	});
});
