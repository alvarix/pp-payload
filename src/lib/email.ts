const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "PetPortraits.ink", email: "no-reply@petportraits.ink" };
const ADMIN_EMAIL = "alvar@petportraits.ink";

/**
 * Sends an admin notification email via the Brevo transactional API.
 * Requires BREVO_API_KEY in env.
 *
 * @param opts.clientName - Full name or email of the client
 * @param opts.email - Client's email address
 * @param opts.petName - Pet's name from the intake form
 * @param opts.jobId - Payload job record ID
 * @param opts.jobType - Order type (street or studio)
 * @param opts.petPicUrls - Direct URLs to uploaded pet photos
 * @param opts.partial - When true, prefixes subject with [partial]
 */
export async function sendIntakeNotification(opts: {
	clientName: string;
	email: string;
	petName: string;
	jobId: number;
	jobType?: string | null;
	petPicUrls?: string[];
	partial?: boolean;
}) {
	const { clientName, email, petName, jobId, jobType, petPicUrls, partial } =
		opts;
	const jobUrl = `https://portal.petportraits.ink/admin/collections/jobs/${jobId}`;
	const subject = partial
		? `[partial] New intake: ${petName} (${clientName})`
		: `New intake: ${petName} (${clientName})`;

	const typeLabel =
		jobType === "street"
			? "Street"
			: jobType === "studio"
				? "Studio"
				: "(not set)";

	const lines: string[] = [
		partial
			? "Partial intake received (photos pending via IG or email)."
			: "New intake form received.",
		"",
		`Client: ${clientName}`,
		`Email:  ${email}`,
		`Pet:    ${petName}`,
		`Type:   ${typeLabel}`,
	];

	if (petPicUrls && petPicUrls.length > 0) {
		lines.push("", "Pet Photos:");
		petPicUrls.forEach((url, i) => lines.push(`  ${i + 1}. ${url}`));
	}

	lines.push("", "View record:", jobUrl);

	const res = await fetch(BREVO_URL, {
		method: "POST",
		headers: {
			"api-key": process.env.BREVO_API_KEY!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			sender: SENDER,
			to: [{ email: ADMIN_EMAIL }],
			subject,
			textContent: lines.join("\n"),
		}),
	});

	if (!res.ok) {
		throw new Error(`Brevo API error: ${res.status}`);
	}
}

/**
 * Sends an admin notification email for a POS (Terminal) sale.
 * Subject is prefixed with [POS] to distinguish from website intake.
 *
 * @param opts.email - Client email used at terminal
 * @param opts.jobId - Created Job record ID
 * @param opts.amountCents - Charged amount in cents
 * @param opts.paymentIntentId - Stripe pi_... ID
 * @param opts.jobType - Order type (street or studio)
 */
export async function sendPosIntakeNotification(opts: {
	email: string;
	jobId: number;
	amountCents: number;
	paymentIntentId: string;
	jobType?: string | null;
}) {
	const { email, jobId, amountCents, paymentIntentId, jobType } = opts;
	const jobUrl = `https://portal.petportraits.ink/admin/collections/jobs/${jobId}`;
	const amount = (amountCents / 100).toFixed(2);

	const typeLabel =
		jobType === "street"
			? "Street"
			: jobType === "studio"
				? "Studio"
				: "(not set)";

	const res = await fetch(BREVO_URL, {
		method: "POST",
		headers: {
			"api-key": process.env.BREVO_API_KEY!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			sender: SENDER,
			to: [{ email: ADMIN_EMAIL }],
			subject: `[POS] New sale: ${email} — $${amount}`,
			textContent: [
				"POS (Terminal) sale recorded.",
				"",
				`Client email:      ${email}`,
				`Type:              ${typeLabel}`,
				`Amount:            $${amount}`,
				`Payment Intent ID: ${paymentIntentId}`,
				"",
				"View record:",
				jobUrl,
			].join("\n"),
		}),
	});

	if (!res.ok) {
		throw new Error(`Brevo API error: ${res.status}`);
	}
}

/**
 * Sends an error/abandonment alert email for intake telemetry events.
 * Called by /api/intake/events for submit_failed, validation_blocked, abandoned.
 *
 * @param opts.type - Event type
 * @param opts.sessionId - Browser session UUID
 * @param opts.snapshot - Sanitized form field values (no files)
 * @param opts.error - Error details object if present
 */
export async function sendIntakeErrorAlert(opts: {
	type: string;
	sessionId: string;
	snapshot: Record<string, string> | null;
	error?: unknown;
}) {
	const { type, sessionId, snapshot, error } = opts;
	const firstName = snapshot?.first_name ?? "";
	const lastName = snapshot?.last_name ?? "";
	const email = snapshot?.email ?? "";
	const phone = snapshot?.phone ?? "";
	const petName = snapshot?.pet_name ?? "";
	const petBreed = snapshot?.pet_breed ?? "";
	const stripeSessionId = snapshot?.stripe_checkout_session_id ?? "none";
	const displayName = firstName || email || "anonymous";

	const adminLink =
		`https://portal.petportraits.ink/admin/collections/intake-events` +
		`?where[session_id][equals]=${encodeURIComponent(sessionId)}`;

	const res = await fetch(BREVO_URL, {
		method: "POST",
		headers: {
			"api-key": process.env.BREVO_API_KEY!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			sender: SENDER,
			to: [{ email: ADMIN_EMAIL }],
			subject: `[intake] ${type}: ${displayName}`,
			textContent: [
				`Type:    ${type}`,
				`Session: ${sessionId}`,
				`Time:    ${new Date().toISOString()}`,
				"",
				"Form so far:",
				`  Name:  ${[firstName, lastName].filter(Boolean).join(" ") || "(none)"}`,
				`  Email: ${email || "(none)"}`,
				`  Phone: ${phone || "(none)"}`,
				`  Pet:   ${petName || "(none)"}${petBreed ? ` (${petBreed})` : ""}`,
				"",
				"Error details:",
				`  ${error ? JSON.stringify(error, null, 2) : "none"}`,
				"",
				`Stripe session: ${stripeSessionId}`,
				"",
				"Admin link (filter events by session):",
				adminLink,
			].join("\n"),
		}),
	});

	if (!res.ok) {
		throw new Error(`Brevo API error: ${res.status}`);
	}
}
